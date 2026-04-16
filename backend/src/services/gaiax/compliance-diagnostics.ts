import axios from 'axios';
import jwt from 'jsonwebtoken';
import logger from '../../lib/logger';

const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function classifyBodyAsJwtOrHtml(body: string): {
  looksLikeCompactJws: boolean;
  looksLikeHtml: boolean;
  looksLikeJson: boolean;
  length: number;
  preview: string;
} {
  const trimmed = (body || '').trim();
  const looksLikeHtml =
    /^(\s*<!DOCTYPE|\s*<html|<HTML|<!doctype)/i.test(trimmed) ||
    /<head[\s>]|<body[\s>]|<script/i.test(trimmed) ||
    /ngrok/i.test(trimmed);
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const looksLikeCompactJws = COMPACT_JWS.test(trimmed);
  return {
    looksLikeCompactJws,
    looksLikeHtml,
    looksLikeJson,
    length: trimmed.length,
    preview: trimmed.slice(0, 160).replace(/\s+/g, ' '),
  };
}

/**
 * GET the same `vcid` URL the compliance service will call. Detects ngrok HTML interstitial
 * (Gaia-X cannot send ngrok-skip-browser-warning — use paid ngrok, static IP, or non-ngrok URL).
 */
export async function probeVcidUrl(vcIdUrl: string): Promise<void> {
  const variants: { label: string; headers: Record<string, string> }[] = [
    { label: 'minimal', headers: { Accept: 'application/vc+jwt, text/plain, */*' } },
    {
      label: 'ngrok_skip',
      headers: {
        Accept: 'application/vc+jwt, */*',
        'ngrok-skip-browser-warning': 'true',
      },
    },
    {
      label: 'custom_ua',
      headers: {
        Accept: 'application/vc+jwt, */*',
        'User-Agent': 'gx-compliance-preflight/1.0',
      },
    },
  ];

  const snapshots: Array<{
    label: string;
    httpStatus?: number;
    contentType?: string;
    classification?: ReturnType<typeof classifyBodyAsJwtOrHtml>;
    error?: string;
  }> = [];

  for (const v of variants) {
    try {
      const r = await axios.get(vcIdUrl, {
        timeout: 12000,
        responseType: 'text',
        transformResponse: [(d) => d],
        validateStatus: () => true,
        headers: v.headers,
      });
      const body = typeof r.data === 'string' ? r.data : String(r.data);
      const c = classifyBodyAsJwtOrHtml(body);
      snapshots.push({
        label: v.label,
        httpStatus: r.status,
        contentType: String(r.headers['content-type'] || ''),
        classification: c,
      });
      logger.info(
        {
          component: 'gaiax:preflight',
          variant: v.label,
          httpStatus: r.status,
          contentType: String(r.headers['content-type'] || ''),
          ...c,
        },
        'vcid URL probe (simulates external GET to LegalParticipant JWT)',
      );
    } catch (err) {
      snapshots.push({ label: v.label, error: (err as Error).message });
      logger.warn(
        {
          component: 'gaiax:preflight',
          variant: v.label,
          err: (err as Error).message,
        },
        'vcid URL probe failed',
      );
    }
  }

  const minimal = snapshots.find((s) => s.label === 'minimal');
  const ngSkip = snapshots.find((s) => s.label === 'ngrok_skip');
  if (
    minimal?.classification?.looksLikeHtml &&
    ngSkip?.classification?.looksLikeCompactJws &&
    ngSkip.httpStatus === 200
  ) {
    logger.error(
      {
        component: 'gaiax:preflight',
        vcIdUrl,
      },
      'NGROK INTERSTITIAL: default GET returns HTML, but GET with ngrok-skip-browser-warning returns a JWT. The Gaia-X compliance service cannot send that header — vcid resolution will fail. Fix: paid ngrok, tunnel without browser warning, Cloudflare Tunnel, or set GAIAX_COMPLIANCE_VCID_URL to a stable HTTPS URL that returns raw VC-JWS without an interstitial.',
    );
  }

  if (minimal?.classification?.looksLikeJson && minimal.httpStatus === 503) {
    logger.error(
      { component: 'gaiax:preflight', vcIdUrl },
      'vcid returns JSON error (e.g. 503 LEGAL_PARTICIPANT_JWT_NOT_AVAILABLE). Ensure mergeLegalParticipantVcJwtIntoIssuedVCs ran before compliance.',
    );
  }
}

export function logVpAndEmbeddedVcDiagnostics(vpJwt: string, vcJwts: string[]): void {
  const parts = vpJwt.split('.');
  if (parts.length !== 3) {
    logger.error({ component: 'gaiax:diag', partCount: parts.length }, 'VP-JWT is not three segments');
    return;
  }
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    const vcs = payload.verifiableCredential as unknown[] | undefined;
    const env = Array.isArray(vcs)
      ? vcs.map((x, i) => {
          const o = x as Record<string, unknown>;
          const id = typeof o.id === 'string' ? o.id : '';
          const prefix = id.slice(0, 48);
          let embeddedParts = 0;
          let embeddedDecodeOk: boolean | null = null;
          if (id.startsWith('data:application/vc+ld+json+jwt,')) {
            const jwtPart = id.slice('data:application/vc+ld+json+jwt,'.length);
            embeddedParts = jwtPart.split('.').length;
            embeddedDecodeOk = jwtPart.split('.').length === 3;
          } else if (id.startsWith('data:application/vc+ld+json+jwt;')) {
            const jwtPart = id.slice('data:application/vc+ld+json+jwt;'.length);
            embeddedParts = jwtPart.split('.').length;
            embeddedDecodeOk = jwtPart.split('.').length === 3;
          } else if (id.startsWith('data:application/vc+jwt,')) {
            const jwtPart = id.slice('data:application/vc+jwt,'.length);
            embeddedParts = jwtPart.split('.').length;
            embeddedDecodeOk = jwtPart.split('.').length === 3;
          }
          return { index: i, idPrefix: prefix, embeddedJwsParts: embeddedParts, embeddedLooksValid: embeddedDecodeOk };
        })
      : [];

    logger.info(
      {
        component: 'gaiax:diag',
        vpHeader: { alg: header.alg, typ: header.typ, cty: header.cty, kid: header.kid, hasIss: 'iss' in header, hasX5c: 'x5c' in header },
        vpPayloadKeys: Object.keys(payload),
        verifiableCredentialCount: Array.isArray(vcs) ? vcs.length : 0,
        envelopedCredentials: env,
      },
      'VP-JWT structure (holder presentation)',
    );
  } catch (e) {
    logger.error({ component: 'gaiax:diag', err: (e as Error).message }, 'Failed to decode VP-JWT for diagnostics');
  }

  vcJwts.forEach((j, i) => {
    const segs = j.split('.');
    const ok = segs.length === 3;
    let payloadKeys: string[] = [];
    if (ok) {
      try {
        const p = jwt.decode(j, { complete: false }) as Record<string, unknown> | null;
        payloadKeys = p ? Object.keys(p) : [];
      } catch {
        payloadKeys = [];
      }
    }
    logger.info(
      {
        component: 'gaiax:diag',
        embeddedVcIndex: i,
        jwsParts: segs.length,
        payloadClaimKeys: payloadKeys.slice(0, 25),
      },
      'Embedded VC-JWT in VP (by position)',
    );
  });
}

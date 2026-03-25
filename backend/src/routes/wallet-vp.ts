/**
 * Wallet VP Generation Routes
 * Allows the wallet app to generate Verifiable Presentations
 * from held credentials.
 */

import { Router } from 'express';
import prisma from '../db';
import {
  createVerifiablePresentation,
  VerifiableCredential,
  signVC,
} from '../services/vp-processor';

const router = Router();

/**
 * GET /credentials/:userId/ownership
 * Get all OwnershipVCs held by a user, formatted as W3C VCs
 */
router.get('/credentials/:userId/ownership', async (req, res) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: req.params.userId },
    include: { credentials: { include: { credential: true } } },
  });
  if (!wallet) return res.json([]);

  const ownershipCreds = wallet.credentials
    .map(wc => wc.credential)
    .filter((c: any) => c && c.type === 'OwnershipVC')
    .map((c: any) => formatAsW3CVC(c));

  res.json(ownershipCreds);
});

/**
 * POST /generate-vp
 * Generate a Verifiable Presentation wrapping specified credentials
 */
router.post('/generate-vp', async (req, res) => {
  const { userId, credentialIds, challenge, domain } = req.body;

  if (!userId || !credentialIds || !Array.isArray(credentialIds) || credentialIds.length === 0) {
    return res.status(400).json({ error: 'userId and credentialIds[] are required' });
  }

  const holderDid = `did:smartsense:${userId}`;

  // Fetch and format credentials as W3C VCs
  const credentials: VerifiableCredential[] = [];
  for (const credId of credentialIds) {
    const cred = await prisma.credential.findUnique({ where: { id: credId } });
    if (!cred) {
      return res.status(404).json({ error: `Credential ${credId} not found` });
    }
    credentials.push(formatAsW3CVC(cred));
  }

  // Generate VP
  const vp = createVerifiablePresentation(holderDid, credentials, {
    challenge,
    domain,
  });

  // Log presentation event
  await prisma.vehicleAuditLog.create({
    data: {
      id: require('uuid').v4(),
      vin: (credentials[0]?.credentialSubject as any)?.vin || 'unknown',
      action: 'vp_created',
      actor: holderDid,
      timestamp: new Date(),
      details: {
        credentialTypes: credentials.map(c => c.type.join(', ')),
        challenge,
        domain,
      } as any,
    },
  });

  res.json({
    vp,
    vpToken: vp, // Same as vp for JSON format; would be JWT in production
    holderDid,
    credentialCount: credentials.length,
    createdAt: new Date().toISOString(),
  });
});

/**
 * POST /submit-vp
 * Wallet submits VP directly to the verifier callback
 * (convenience endpoint that proxies to the verifier)
 */
router.post('/submit-vp', async (req, res) => {
  const { requestId, vpToken } = req.body;

  if (!requestId || !vpToken) {
    return res.status(400).json({ error: 'requestId and vpToken required' });
  }

  try {
    const axios = require('axios');
    const REGISTRY_BASE = process.env.APP_BASE_URL || 'http://localhost:8000';
    const resp = await axios.post(`${REGISTRY_BASE}/api/verifier/callback`, {
      requestId,
      vpToken,
    });
    res.json(resp.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(
      err.response?.data || { error: err.message }
    );
  }
});

// --------------- Helpers ---------------

function formatAsW3CVC(dbCred: any): VerifiableCredential {
  // Map from our DB credential format to W3C VC format
  const issuerDid = dbCred.credentialSubject?.issuedBy
    || (dbCred.issuerId === 'eu-dataspace' ? 'did:eu-dataspace:eu-apac' : `did:eu-dataspace:${dbCred.issuerId}`);

  // For OwnershipVC, the issuer is the manufacturer
  const issuer = dbCred.type === 'OwnershipVC'
    ? { id: 'did:eu-dataspace:company-toyota-001', name: 'Toyota Motor Corporation' }
    : { id: issuerDid, name: dbCred.issuerName || 'Unknown' };

  const resolvedIssuerDid = typeof issuer === 'string' ? issuer : issuer.id;

  const vcPayload = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/catenax/vehicle/v1',
    ],
    type: ['VerifiableCredential', dbCred.type],
    id: `urn:credential:${dbCred.id}`,
    issuer,
    issuanceDate: dbCred.issuedAt,
    credentialSubject: {
      ...dbCred.credentialSubject,
      // Ensure ownerId is always present for OwnershipVCs
      ...(dbCred.type === 'OwnershipVC' && !dbCred.credentialSubject?.ownerId && dbCred.credentialSubject?.ownerDid
        ? { ownerId: dbCred.credentialSubject.ownerDid.replace('did:smartsense:', '') }
        : {}),
    },
  };

  // Sign the VC with the issuer's real RSA private key
  const vcJwt = signVC(vcPayload, resolvedIssuerDid);

  return {
    ...vcPayload,
    proof: {
      type: 'JsonWebSignature2020',
      created: dbCred.issuedAt,
      proofPurpose: 'assertionMethod',
      verificationMethod: `${resolvedIssuerDid}#key-1`,
      jws: vcJwt,
    },
    _jwt: vcJwt,
  };
}

export default router;

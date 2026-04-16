import prisma from '../../db';
import type { DidDocument } from '../did-resolver';
import { refreshOperatorWalletPublicJwksInDb } from './operator-wallet-service';

/** Platform operator `did:web` (GXDCH / trust-anchor), same host path as legacy VPSigner. */
export function buildPlatformOperatorDidString(): string {
  const domain = process.env.GAIAX_DID_DOMAIN || 'localhost%3A8000';
  const pathSeg = process.env.GAIAX_DID_PATH || 'v1';
  return `did:web:${domain}:${pathSeg}`;
}

/**
 * DID document for the operator walt.id wallet (cached JWKs on OperatorWallet).
 * Returns null if operator wallet is not provisioned or JWKs cannot be loaded.
 */
export async function getPlatformOperatorDidDocument(): Promise<DidDocument | null> {
  let row = await prisma.operatorWallet.findFirst();
  if (!row) return null;

  let ed = row.ed25519PublicJwk as Record<string, unknown> | null | undefined;
  let rsa = row.rsaPublicJwk as Record<string, unknown> | null | undefined;
  if (!ed?.kty || !rsa?.kty) {
    await refreshOperatorWalletPublicJwksInDb();
    row = await prisma.operatorWallet.findFirst();
    if (!row) return null;
    ed = row.ed25519PublicJwk as Record<string, unknown> | null | undefined;
    rsa = row.rsaPublicJwk as Record<string, unknown> | null | undefined;
  }
  if (!ed?.kty || !rsa?.kty) return null;

  const did = buildPlatformOperatorDidString();
  const edKeyId = `${did}#key-ed25519`;
  const rsaKeyId = `${did}#key-rsa`;
  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
    id: did,
    verificationMethod: [
      {
        id: edKeyId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: { ...ed, kid: edKeyId },
      },
      {
        id: rsaKeyId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: { ...rsa, kid: rsaKeyId },
      },
    ],
    authentication: [edKeyId],
    assertionMethod: [edKeyId, rsaKeyId],
  };
}

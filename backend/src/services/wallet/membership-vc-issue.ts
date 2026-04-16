import prisma from '../../db';
import logger from '../../lib/logger';
import { getCompanyWalletContext } from './company-wallet-service';
import { issueJwtVcViaIssuerAndClaim, type IssuedWalletCredential } from './walt-oid4vci-issue';
import { refreshOperatorWalletPublicJwksInDb, getOperatorEd25519PrivateJwk } from './operator-wallet-service';
import { buildPlatformOperatorDidString } from './platform-operator-did';
import { WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID } from './waltid-oid4vci-defaults';

/**
 * Issue a Membership VC (operator as issuer, Ed25519) and claim it into the **company** walt.id wallet.
 * @see docs/adr/002-per-company-wallet-ssi-architecture.md — Membership stored in participant wallet.
 */
export async function issueMembershipVcIntoCompanyWallet(params: {
  companyId: string;
  companyDid: string;
}): Promise<IssuedWalletCredential | null> {
  let opRow = await prisma.operatorWallet.findFirst();
  if (!opRow) {
    logger.warn({ component: 'membership-vc', companyId: params.companyId }, 'No operator wallet — skip Membership VC');
    return null;
  }

  let edJwk = opRow.ed25519PublicJwk as Record<string, unknown> | null | undefined;
  if (!edJwk?.kty) {
    await refreshOperatorWalletPublicJwksInDb();
    const again = await prisma.operatorWallet.findFirst();
    if (!again) return null;
    opRow = again;
    edJwk = opRow.ed25519PublicJwk as Record<string, unknown> | null | undefined;
  }
  if (!edJwk?.kty) return null;

  const ctx = await getCompanyWalletContext(params.companyId);
  if (!ctx) {
    logger.warn({ component: 'membership-vc', companyId: params.companyId }, 'No company wallet session — skip Membership VC');
    return null;
  }

  const operatorDid = buildPlatformOperatorDidString();

  // The waltid issuer API needs the PRIVATE key to sign the credential during OID4VCI claim.
  // Export transiently — never persisted.
  const privateEdJwk = await getOperatorEd25519PrivateJwk();
  const issuerJwk = privateEdJwk
    ? { ...privateEdJwk, kid: `${operatorDid}#key-ed25519` }
    : { ...edJwk, kid: `${operatorDid}#key-ed25519` };

  const now = new Date().toISOString();
  const credentialData: Record<string, unknown> = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'MembershipCredential'],
    issuer: { id: operatorDid },
    issuanceDate: now,
    credentialSubject: {
      id: params.companyDid,
      memberOf: 'https://smartsense.eu/dataspace',
    },
  };

  const credentialConfigurationId =
    process.env.WALTID_MEMBERSHIP_CREDENTIAL_CONFIG_ID?.trim() || WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID;

  try {
    return await issueJwtVcViaIssuerAndClaim({
      session: ctx.session,
      walletId: ctx.walletId,
      issuerDid: operatorDid,
      issuerPublicJwk: issuerJwk,
      credentialData,
      credentialConfigurationId,
    });
  } catch (e) {
    logger.warn({ component: 'membership-vc', err: (e as Error).message }, 'Membership VC issuance failed');
    return null;
  }
}

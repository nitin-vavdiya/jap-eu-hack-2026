import prisma from '../../db';

/**
 * Persist the Legal Participant VC-JWT on the org credential so
 * `GET {GAIAX_DID_DOMAIN}/vc/{id}/jwt` can serve raw `application/vc+jwt`.
 *
 * GXDCH compliance resolves the `vcid` query parameter by HTTP GET; it must receive
 * a compact VC-JWS, not JSON-LD (see gx-compliance credential-offers flow).
 *
 * This is the only DB-persisted copy of the JWT — kept solely for public URL serving.
 * All other credential storage is in the company's walt.id wallet.
 */
export async function mergeLegalParticipantVcJwtIntoIssuedVCs(
  orgCredentialId: string,
  vcJwt: string,
  _issuerDid: string,
): Promise<void> {
  await prisma.orgCredential.update({
    where: { id: orgCredentialId },
    data: { lpVcJwt: vcJwt },
  });
}

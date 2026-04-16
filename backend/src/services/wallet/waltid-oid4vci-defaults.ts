/**
 * OID4VCI `credential_configuration_id` sent to walt.id issuer-api.
 *
 * We intentionally use the stack’s generic **`UniversityDegree_jwt_vc_json`** profile
 * (JWT VC shape) until issuer metadata and payloads are pinned to custom ids such as
 * `LegalParticipant_jwt_vc_json` in `waltid/issuer-api/credential-issuer-metadata.conf`.
 *
 * @see https://docs.walt.id/ — OpenID4VCI credential configurations
 */
export const WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID =
  (process.env.WALTID_DEFAULT_JWT_VC_CONFIGURATION_ID || 'UniversityDegree_jwt_vc_json').trim();

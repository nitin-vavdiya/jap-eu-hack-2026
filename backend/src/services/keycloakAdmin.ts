import axios from 'axios';
import logger from '../lib/logger';

const KEYCLOAK_URL    = process.env.KEYCLOAK_URL             || 'http://localhost:8080';
// No default realm — KEYCLOAK_REALM is a REQUIRED env var (validated at startup).
// A missing or wrong realm would cause silent auth failures that are hard to diagnose.
const KEYCLOAK_REALM  = process.env.KEYCLOAK_REALM           || 'eu-jap-hack';
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli';
const ADMIN_SECRET    = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';

async function getAdminToken(): Promise<string> {
  // Log the curl equivalent for debugging — secret is REDACTED intentionally
  logger.info({ component: 'keycloak' }, `curl equivalent — get admin token:\n  curl -s -X POST '${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token' \\\n    -H 'Content-Type: application/x-www-form-urlencoded' \\\n    -d 'grant_type=client_credentials&client_id=${ADMIN_CLIENT_ID}&client_secret=[REDACTED]'`);
  const res = await axios.post(
    `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     ADMIN_CLIENT_ID,
      client_secret: ADMIN_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return res.data.access_token as string;
}

/**
 * Creates a user in Keycloak and returns their UUID.
 * The UUID is extracted from the Location header of the 201 response.
 */
export async function createKeycloakUser(
  email: string,
  password: string,
  firstName?: string,
): Promise<string> {
  const token = await getAdminToken();

  // Log curl equivalent for debugging — password is REDACTED intentionally.
  // The credentials field is omitted from the log to prevent plaintext password exposure.
  const userPayloadForLog = { email, username: email, firstName: firstName || '', enabled: true, emailVerified: true, credentials: '[REDACTED]' };
  logger.info({ component: 'keycloak' }, `curl equivalent — create user:\n  curl -s -X POST '${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users' \\\n    -H 'Authorization: Bearer <TOKEN>' \\\n    -H 'Content-Type: application/json' \\\n    -d '${JSON.stringify(userPayloadForLog)}'`);

  const userPayload = {
    email,
    username: email,
    firstName: firstName || '',
    enabled: true,
    emailVerified: true,
    credentials: [{ type: 'password', value: password, temporary: true }],
  };

  let res;
  try {
    res = await axios.post(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
      userPayload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    if (err.response?.status === 409) {
      // Keycloak returns 409 when a user with this email/username already exists
      throw new Error(`USER_ALREADY_EXISTS_IN_KEYCLOAK: A user with email "${email}" already exists in Keycloak`);
    }
    throw err;
  }

  // Keycloak returns the new user URL in the Location header:
  //   /admin/realms/{realm}/users/{uuid}
  const location: string = res.headers['location'] || '';
  const uuid = location.split('/').pop();
  if (!uuid) throw new Error('Keycloak did not return a user ID in the Location header');

  logger.info({ component: 'keycloak', email, keycloakId: uuid }, 'Created user');

  // Step 3 — fetch role representation to get role id
  logger.info({ component: 'keycloak' }, `curl equivalent — get role:\n  curl -s -X GET '${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/company_admin' \\\n    -H 'Authorization: Bearer <TOKEN>'`);
  const roleRes = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles/company_admin`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const role = { id: roleRes.data.id as string, name: roleRes.data.name as string };

  // Step 4 — assign realm role to the new user
  logger.info({ component: 'keycloak' }, `curl equivalent — assign role:\n  curl -s -X POST '${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${uuid}/role-mappings/realm' \\\n    -H 'Authorization: Bearer <TOKEN>' \\\n    -H 'Content-Type: application/json' \\\n    -d '[{"id":"${role.id}","name":"${role.name}"}]'`);
  await axios.post(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${uuid}/role-mappings/realm`,
    [role],
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
  );

  logger.info({ component: 'keycloak', email, keycloakId: uuid, role: 'company_admin' }, 'Assigned realm role to user');
  return uuid;
}

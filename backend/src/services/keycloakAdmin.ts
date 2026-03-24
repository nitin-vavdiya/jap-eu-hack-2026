import axios from 'axios';

const KEYCLOAK_URL    = process.env.KEYCLOAK_URL            || 'http://localhost:8080';
const KEYCLOAK_REALM  = process.env.KEYCLOAK_REALM          || 'master';
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli';
const ADMIN_SECRET    = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';

async function getAdminToken(): Promise<string> {
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
  console.log(`[keycloak] curl equivalent — get admin token:\n  curl -s -X POST '${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token' \\\n    -H 'Content-Type: application/x-www-form-urlencoded' \\\n    -d 'grant_type=client_credentials&client_id=${ADMIN_CLIENT_ID}&client_secret=${ADMIN_SECRET}'`);
  const token = await getAdminToken();

  const userPayload = { email, username: email, firstName: firstName || '', enabled: true, emailVerified: true, credentials: [{ type: 'password', value: password, temporary: false }] };
  console.log(`[keycloak] curl equivalent — create user:\n  curl -s -X POST '${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users' \\\n    -H 'Authorization: Bearer <TOKEN>' \\\n    -H 'Content-Type: application/json' \\\n    -d '${JSON.stringify(userPayload)}'`);

  const res = await axios.post(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
    userPayload,
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
  );

  // Keycloak returns the new user URL in the Location header:
  //   /admin/realms/{realm}/users/{uuid}
  const location: string = res.headers['location'] || '';
  const uuid = location.split('/').pop();
  if (!uuid) throw new Error('Keycloak did not return a user ID in the Location header');

  console.log(`[keycloak] Created user ${email} → ${uuid}`);
  return uuid;
}

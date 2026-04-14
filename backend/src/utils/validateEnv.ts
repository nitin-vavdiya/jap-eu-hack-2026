/**
 * Startup environment variable validation.
 *
 * REQUIRED vars — backend refuses to start if any are missing in production.
 * APP_BASE_URL is REQUIRED in staging/production and RECOMMENDED in development
 * (must be a stable public HTTPS URL for Gaia-X DID resolution to succeed).
 *
 * RECOMMENDED vars — warn at startup but do not block.
 *
 * IMPORTANT: Only var *names* are logged — never values — because KEYCLOAK_ADMIN_CLIENT_SECRET
 * and DATABASE_URL (which embeds a password) are in the REQUIRED list.
 */

const REQUIRED_VARS = [
  'DATABASE_URL',
  'KEYCLOAK_URL',
  'KEYCLOAK_REALM',
  'KEYCLOAK_ADMIN_CLIENT_ID',
  'KEYCLOAK_ADMIN_CLIENT_SECRET',
];

/**
 * APP_BASE_URL is required in non-development environments.
 * Without a stable public URL the Gaia-X compliance service cannot resolve the
 * company DID document at {APP_BASE_URL}/company/{id}/did.json.
 */
const REQUIRED_IN_PRODUCTION = ['APP_BASE_URL'];

const RECOMMENDED_VARS = [
  'LOG_LEVEL',
  'ENABLE_EDC_PROVISIONING',
  'PROVISIONING_SERVICE_URL',
  'MAX_COMPANIES',
];

export function validateEnv(): void {
  const isDev = process.env.NODE_ENV !== 'production';
  const missing: string[] = [];
  const warned: string[] = [];

  // Check always-required vars
  for (const name of REQUIRED_VARS) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }

  // Check production-required vars
  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!process.env[name]) {
      if (isDev) {
        warned.push(name);
      } else {
        missing.push(name);
      }
    }
  }

  // Warn on recommended vars
  for (const name of RECOMMENDED_VARS) {
    if (!process.env[name]) {
      warned.push(name);
    }
  }

  if (warned.length > 0) {
    console.warn(
      `[startup] RECOMMENDED env vars not set (defaults will be used): ${warned.join(', ')}`,
    );
    if (!process.env['APP_BASE_URL'] && isDev) {
      console.warn(
        '[startup] APP_BASE_URL is not set — Gaia-X compliance verification will fail because the ' +
        'company DID document will not be publicly resolvable. Set APP_BASE_URL to a stable, ' +
        'publicly accessible HTTPS URL (e.g., an ngrok tunnel or production domain) to enable ' +
        'Gaia-X verification.',
      );
    }
  }

  if (missing.length > 0) {
    console.error(
      '[startup] FATAL: The following required environment variables are not set:',
    );
    for (const name of missing) {
      console.error(`  - ${name}`);
    }
    console.error(
      '[startup] Set these variables in your .env file (see backend/.env.example) and restart.',
    );
    process.exit(1);
  }
}

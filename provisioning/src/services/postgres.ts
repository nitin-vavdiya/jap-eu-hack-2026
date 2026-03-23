import { Client } from 'pg';
import { randomBytes } from 'crypto';

/**
 * Generates a random secure password for the tenant DB user.
 */
function generateDbPassword(): string {
  return randomBytes(24).toString('base64url');
}

export interface TenantDbResult {
  dbHost: string;
  dbName: string;
  dbUser: string;
  dbPass: string;
}

/**
 * Idempotently creates a dedicated Postgres database and user for a tenant.
 * - Connects to the shared cluster PostgreSQL with admin credentials.
 * - Skips creation if DB / user already exist (safe to retry).
 * - Returns the connection parameters written to Vault.
 */
export async function createTenantDatabase(tenantCode: string): Promise<TenantDbResult> {
  const adminUrl = process.env.POSTGRES_ADMIN_URL;
  if (!adminUrl) throw new Error('POSTGRES_ADMIN_URL is not set');

  const dbName = `edc_${tenantCode.replace(/-/g, '_')}`;
  const dbUser = `edc_${tenantCode.replace(/-/g, '_')}`;

  console.log(`[postgres] Provisioning database "${dbName}" for tenant "${tenantCode}"`);

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  console.log(`[postgres] Connected to shared PostgreSQL`);

  try {
    // Check if DB already exists
    const dbCheck = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (dbCheck.rowCount === 0) {
      console.log(`[postgres] Creating database "${dbName}"`);
      await client.query(`CREATE DATABASE "${dbName}"`);
    } else {
      console.log(`[postgres] Database "${dbName}" already exists — skipping`);
    }

    // Check if user already exists
    const userCheck = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = $1`,
      [dbUser],
    );

    let dbPass: string;
    if (userCheck.rowCount === 0) {
      dbPass = generateDbPassword();
      console.log(`[postgres] Creating user "${dbUser}"`);
      // Using identifier quoting; password is parameterised via string interpolation
      // since CREATE USER doesn't support $1 placeholders for passwords
      await client.query(`CREATE USER "${dbUser}" WITH PASSWORD '${dbPass.replace(/'/g, "''")}'`);
    } else {
      // User already exists — generate a new password and update it (idempotent rotation)
      dbPass = generateDbPassword();
      console.log(`[postgres] User "${dbUser}" already exists — rotating password`);
      await client.query(`ALTER USER "${dbUser}" WITH PASSWORD '${dbPass.replace(/'/g, "''")}'`);
    }

    console.log(`[postgres] Granting privileges on "${dbName}" to "${dbUser}"`);
    await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);

    // Parse host from admin URL
    const url = new URL(adminUrl);
    const dbHost = url.hostname;

    console.log(`[postgres] Database provisioning complete for tenant "${tenantCode}"`);
    return { dbHost, dbName, dbUser, dbPass };
  } finally {
    await client.end();
  }
}

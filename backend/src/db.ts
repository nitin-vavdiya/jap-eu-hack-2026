import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import path from 'path';

interface DbSchema {
  companies: any[];
  credentials: any[];
  cars: any[];
  wallet: Record<string, { credentialIds: string[] }>;
  consent: any[];
  purchases: any[];
  insurance_policies: any[];
  org_credentials: any[];
}

const adapter = new FileSync<DbSchema>(path.join(__dirname, '../data/db.json'));
const db = low(adapter);

// Set defaults
db.defaults({
  companies: [],
  credentials: [],
  cars: [],
  wallet: {},
  consent: [],
  purchases: [],
  insurance_policies: [],
  org_credentials: []
}).write();

export default db;

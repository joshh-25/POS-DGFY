
import db from '../src/models/index.js';
const { Tenant } = db;
console.log('Tenant rawAttributes:', Object.keys(Tenant.rawAttributes));
process.exit(0);

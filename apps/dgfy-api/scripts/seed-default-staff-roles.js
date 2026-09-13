import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_ROLE_PERMISSIONS, getAllPermissions } from '../src/config/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const dbName = process.env.DB_NAME || 'sku_inventory_manager';
const safe = /^[A-Za-z0-9_-]+$/;
const quote = (value) => { if (!safe.test(value)) throw new Error(`Unsafe database identifier: ${value}`); return `\`${value}\``; };
const roleDefaults = [['Admin', 'admin'], ['Manager', 'manager'], ['Staff', 'staff'], ['Cashier', 'cashier'], ['Purchase Order', 'po'], ['Delivery Order', 'do'], ['Job Order', 'jo']];

const main = async () => {
  const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '' });
  try {
    const [tenantRows] = await connection.query(`SELECT db_name FROM ${quote(dbName)}.\`tenants\` WHERE db_name IS NOT NULL AND db_name <> ''`);
    const databases = [...new Set([dbName, ...tenantRows.map((row) => String(row.db_name || '').trim()).filter((value) => safe.test(value))])];
    let inserted = 0;
    for (const database of databases) {
      const qualified = quote(database);
      const [tables] = await connection.query('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [database, 'staff_roles']);
      if (!Number(tables?.[0]?.count || 0)) continue;
      for (const [name, role] of roleDefaults) {
        const capabilities = role === 'admin' ? getAllPermissions() : (DEFAULT_ROLE_PERMISSIONS[role] || []);
        const [result] = await connection.query(`INSERT INTO ${qualified}.\`staff_roles\` (name, capabilities, is_active, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE capabilities = IF(JSON_LENGTH(capabilities) = 0, VALUES(capabilities), capabilities), is_active = 1, updated_at = NOW()`, [name, JSON.stringify(capabilities)]);
        inserted += Number(result.affectedRows === 1);
      }
      console.log(`[StaffRoleSeed] ${database}: ensured ${roleDefaults.length} default roles`);
    }
    console.log(`[StaffRoleSeed] Complete: inserted=${inserted}`);
  } finally { await connection.end(); }
};
main().catch((error) => { console.error('[StaffRoleSeed] Fatal error:', error); process.exitCode = 1; });

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');
const migrationRunnerRoot = path.resolve(apiRoot, '..', 'dgfy-migration-runner');
const migrationPath = path.join(migrationRunnerRoot, 'migrations', '20260519000001-create-commerce-payment-sessions.cjs');

const source = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');

const requiredSnippets = [
  "createTable('tenant_payment_accounts'",
  "wallet_status: { type: Sequelize.ENUM('unknown', 'closed_loop', 'enabled', 'restricted')",
  "wallet_verified_at: { type: Sequelize.DATE",
  "createTable('commerce_payment_sessions'",
  "createTable('commerce_payment_refunds'",
  "tenant_id: {\n          type: Sequelize.UUID",
  "addColumn('pos_transactions', 'payment_status'",
  "'refund_pending'",
  "'partial_refunded'",
  "'refunded'",
  "addColumn('pos_transactions', 'payment_provider'",
  "addColumn('pos_transactions', 'payment_session_reference'",
  "removeColumn('pos_transactions', 'payment_status'",
  "dropTable('commerce_payment_refunds'",
  "dropTable('commerce_payment_sessions'",
  "dropTable('tenant_payment_accounts'"
];

const missing = requiredSnippets.filter((snippet) => !source.includes(snippet));

if (missing.length > 0) {
  console.error('[commerce-payment-migration-contract] Missing required migration contract snippets:');
  for (const snippet of missing) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log('[commerce-payment-migration-contract] OK. Migration includes payment tables, wallet readiness, refund statuses, tenant order columns, and rollback drops.');

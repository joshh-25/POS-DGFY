#!/usr/bin/env node
/**
 * Tear down the fixture tenant created by seed-preflight-fixture.js. Ephemeral CI infrastructure
 * means this is best-effort cleanup, not a correctness requirement -- the whole container stack is
 * discarded at the end of the workflow run either way -- but running it anyway avoids leaving a
 * stray tenant row behind on a self-hosted runner that reuses its MySQL volume across runs.
 *
 * Usage:
 *   node scripts/teardown-preflight-fixture.js <tenant-id>
 */

import sequelize from '../src/config/database.js';
import { Tenant } from '../src/models/index.js';
import { deleteTenantDatabase } from '../src/services/tenantProvisioningService.js';

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    process.stderr.write('[teardown-preflight-fixture] Usage: node scripts/teardown-preflight-fixture.js <tenant-id>\n');
    process.exitCode = 1;
    return;
  }

  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) {
    process.stderr.write(`[teardown-preflight-fixture] Tenant ${tenantId} not found -- nothing to do.\n`);
    return;
  }

  await deleteTenantDatabase(tenant.db_name);
  await tenant.destroy();
  process.stderr.write(`[teardown-preflight-fixture] Removed tenant ${tenantId} (${tenant.db_name}).\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // Best-effort: log and exit 0 rather than fail the whole workflow run over cleanup.
    process.stderr.write(`[teardown-preflight-fixture] Cleanup failed (non-fatal): ${error.message}\n`);
    process.exit(0);
  });

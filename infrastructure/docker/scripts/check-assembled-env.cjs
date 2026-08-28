#!/usr/bin/env node
// Validates the CURRENT process environment against
// apps/dgfy-api/src/config/productionEnvValidation.cjs's real production
// gate -- the same check apps/dgfy-api/src/server.js:193-198 runs at boot,
// run here BEFORE `docker compose up` so a missing/invalid var fails loudly
// on the deploy host instead of crash-looping the container.
//
// Deliberately distinct from `npm run check:production-env`
// (scripts/check-production-env-fixtures.js): that script validates a set
// of HARDCODED FIXTURE scenarios to catch regressions in the validator
// itself -- it does not read the real environment, so it cannot tell you
// whether a specific assembled deploy env (e.g. this cutover's
// secrets/*.env exports + docker-compose.yml literals) actually passes.
// This script is the one that answers that question.
//
// Usage: node check-assembled-env.cjs
//   Exit 0 + prints "OK" -- the current process env would pass
//   apps/dgfy-api's production boot check.
//   Exit 1 + prints every failing check -- fix these before deploying.
//
// Run from a context where apps/dgfy-api/src/config/productionEnvValidation.cjs
// is reachable (a repo checkout, or that one file copied alongside this
// script) -- it has no dependencies of its own, only Node builtins, so no
// `npm install` is required to run this specific check.
'use strict';

const path = require('path');
const fs = require('fs');

const candidates = [
  path.join(__dirname, '..', '..', '..', 'apps', 'dgfy-api', 'src', 'config', 'productionEnvValidation.cjs'),
  path.join(__dirname, 'productionEnvValidation.cjs')
];
const target = candidates.find((p) => fs.existsSync(p));
if (!target) {
  console.error(
    'check-assembled-env.cjs: could not find productionEnvValidation.cjs at any of:\n' +
    candidates.map((p) => `  - ${p}`).join('\n')
  );
  process.exit(1);
}

const { validateProductionEnv, formatValidationFailure } = require(target);

const result = validateProductionEnv({ env: process.env });

if (result.warnings && result.warnings.length > 0) {
  console.warn('[check-assembled-env] warnings (non-fatal):');
  for (const w of result.warnings) console.warn(`  - ${w}`);
}

if (result.shouldFail) {
  console.error('[check-assembled-env] FAIL -- this environment would crash-loop dgfy-api at boot:');
  for (const e of result.errors) console.error(`  - ${e}`);
  console.error('');
  console.error(formatValidationFailure(result));
  process.exit(1);
}

console.log('[check-assembled-env] OK -- assembled environment passes the production boot check.');
process.exit(0);

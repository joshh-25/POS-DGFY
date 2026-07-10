import { Command } from 'commander';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { runSchemaMigrate } from './commands/schema.js';
import { runDataDryRun, runDataApply } from './commands/data.js';
import { runVerify } from './commands/verify.js';
import { runStatus } from './commands/status.js';
import { runRollbackPlan } from './commands/rollbackPlan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Builds the Commander program wiring all six RUN-02 subcommands to their
 * run*() handlers. Exported (not just constructed inline) so cliContract.test.js
 * can exercise real dispatch/option-parsing against mocked command modules
 * without spawning a child process for every assertion.
 */
export function buildProgram() {
  const program = new Command();

  program
    .name('dgfy-migration-runner')
    .description('DGFY database-first migration runner: schema, data, verify, status, rollback-plan commands')
    .version('1.0.0');

  const schemaCmd = new Command('schema').description('Schema migration commands');
  schemaCmd
    .command('migrate')
    .description(
      'Run pending schema migrations through Umzug. The destructive-migration gate ' +
      '(D-17) only considers migrations Umzug reports as pending — a historical ' +
      'migration that already executed never forces --confirm-destructive for ' +
      'unrelated future additive work.'
    )
    .option('--confirm-destructive', 'Required when any pending migration is marked destructive (per D-09/D-17)')
    .action(async (options) => {
      await runSchemaMigrate({ confirmDestructive: Boolean(options.confirmDestructive) });
    });
  program.addCommand(schemaCmd);

  const dataCmd = new Command('data').description('Data migration commands');
  dataCmd
    .command('dry-run')
    .description('Report planned data migration changes without mutating target data')
    .action(async () => {
      await runDataDryRun({});
    });
  dataCmd
    .command('apply')
    .description('Apply data migration changes to the target database')
    .option('--confirm-destructive', 'Required — data apply is always destructive per D-09')
    .action(async (options) => {
      await runDataApply({ confirmDestructive: Boolean(options.confirmDestructive) });
    });
  program.addCommand(dataCmd);

  program
    .command('verify')
    .description('Run metadata schema and target DB connectivity checks')
    .action(async () => {
      await runVerify({});
    });

  program
    .command('status')
    .description('Show recent command execution history and schema migration status')
    .action(async () => {
      await runStatus({});
    });

  program
    .command('rollback-plan')
    .description('Generate a rollback-plan report artifact (does not execute any rollback)')
    .action(async () => {
      await runRollbackPlan({});
    });

  return program;
}

async function main() {
  // WR-05: dotenv.config() is a process-entrypoint concern, not something
  // src/config/env.js should do at import time — load the real .env file
  // here, immediately before anything else runs, so a developer's local
  // .env can never leak into process.env ahead of a test's explicit
  // applyEnv()/env argument override.
  dotenv.config({ path: join(__dirname, '..', '.env') });

  const program = buildProgram();
  await program.parseAsync(process.argv);
}

// cli.js is the package's `main` entry (package.json "main": "src/cli.js").
// Guard the self-invocation with an isMainModule check (mirroring
// backend/scripts/sync-tenant-schemas.js's isMainModule pattern) so that
// importing this module from a test (to reuse buildProgram()) does not also
// trigger a real process.argv parse / process.exit.
const isMainModule = process.argv[1] && __filename === process.argv[1];
if (isMainModule) {
  main().catch((error) => {
    console.error(`[dgfy-migration-runner] fatal: ${error.message}`);
    process.exit(1);
  });
}

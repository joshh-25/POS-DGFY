import { jest } from '@jest/globals';

/**
 * 06-01 (SC2/D-02/D-03): proves the interactive release-evidence command
 * (a) registers as a first-class `release-evidence` CLI subcommand with an
 * `--evidence-dir` option, (b) fails closed — never falls back to an
 * all-tenants run — when stdin is not a TTY (Pitfall 4), and (c) writes
 * no-secrets report payloads for both the tenant_drift and
 * migration_verification evidence streams.
 *
 * Every test in this file is DB-free/skip-safe: `config/db.js`,
 * `commands/verify.js`, and `@inquirer/prompts` are mocked so the suite
 * never opens a real or attempted MySQL connection. A live-MySQL
 * integration path is gated behind RUN_RELEASE_EVIDENCE_INTEGRATION,
 * mirroring the established RUN_*_INTEGRATION precedent
 * (tests/verifyContinuity.test.js, tests/activateTenant.test.js) — it is
 * skipped by default so this suite stays green with no DB reachable.
 *
 * NOTE on describe-block ORDER (mirrors tests/activateTenant.test.js's
 * identical caution): jest.unstable_mockModule() registrations for a given
 * specifier persist across jest.resetModules() calls within the same test
 * file. The "cli.js registration" describe block below mocks
 * '../src/commands/releaseEvidence.js' itself (to isolate CLI wiring from
 * the command's real DB-touching implementation) — that mock registration
 * would otherwise leak into any later block that needs the REAL
 * releaseEvidence.js module. To prevent that, every describe block that
 * dynamically imports the REAL '../src/commands/releaseEvidence.js' is
 * declared BEFORE the "cli.js registration" describe block, which is
 * intentionally placed LAST in this file.
 */
const RUN_INTEGRATION = process.env.RUN_RELEASE_EVIDENCE_INTEGRATION === 'true';

if (!RUN_INTEGRATION) {
  // eslint-disable-next-line no-console
  console.log(
    '[releaseEvidence.test.js] Real MySQL registry-discovery/drift/migration-verification probe SKIPPED — set '
    + 'RUN_RELEASE_EVIDENCE_INTEGRATION=true (with TARGET_DB_* credentials via .env, plus at least one active/'
    + 'verified business_database_registry row) to run it locally or in CI. Skip-safe cases (CLI registration, '
    + 'fail-closed non-TTY, no-secrets report shape) always run.'
  );
}

const describeIfIntegration = RUN_INTEGRATION ? describe : describe.skip;

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_STDIN_TTY = process.stdin.isTTY;

function baseEnv(overrides = {}) {
  return {
    RUNTIME_MODE: 'development',
    SOURCE_DB_HOST: 'localhost',
    SOURCE_DB_PORT: '3306',
    SOURCE_DB_USER: 'source_user',
    SOURCE_DB_PASSWORD: 'source_pass',
    SOURCE_DB_NAME: 'legacy_ims',
    TARGET_DB_HOST: 'localhost',
    TARGET_DB_PORT: '3306',
    TARGET_DB_USER: 'target_user',
    TARGET_DB_PASSWORD: 'target_pass',
    TARGET_DB_NAME: 'dgfy_core',
    MIGRATION_ACTOR: 'operator@dgfy.ph',
    ...overrides
  };
}

function applyEnv(overrides = {}) {
  process.env = { ...ORIGINAL_ENV, ...baseEnv(overrides) };
}

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function restoreStdinTty() {
  Object.defineProperty(process.stdin, 'isTTY', { value: ORIGINAL_STDIN_TTY, configurable: true });
}

function setStdinTty(value) {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
}

// ---------------------------------------------------------------------------
// DB-backed gated test — RUN_RELEASE_EVIDENCE_INTEGRATION=true with real
// MySQL TARGET_DB_* credentials and at least one active/verified
// business_database_registry row. A real human cannot drive the interactive
// checkbox prompt in CI, so @inquirer/prompts's checkbox is stubbed to
// auto-select every discovered tenant while every other step (registry
// discovery query, drift check, migration-metadata check, report writing)
// runs against the real database. Declared before every mocking describe
// block below (see file-level NOTE).
// ---------------------------------------------------------------------------
describeIfIntegration('runReleaseEvidence — real MySQL registry discovery + drift + migration-verification', () => {
  afterEach(() => {
    restoreEnv();
    restoreStdinTty();
  });

  test('discovers active tenants and produces reviewable evidence reports', async () => {
    applyEnv();
    setStdinTty(true);

    jest.unstable_mockModule('@inquirer/prompts', () => ({
      checkbox: jest.fn(async ({ choices }) => choices.map((choice) => choice.value))
    }));

    const { runReleaseEvidence } = await import('../src/commands/releaseEvidence.js');
    const result = await runReleaseEvidence({});

    expect(typeof result.ok).toBe('boolean');
    expect(Array.isArray(result.selected)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (b) + (c) runReleaseEvidence behavior — skip-safe, DB-free unit tests.
// config/db.js, commands/verify.js, and @inquirer/prompts are mocked so no
// real (or attempted) MySQL connection is ever opened. Each test imports the
// REAL '../src/commands/releaseEvidence.js' module.
// ---------------------------------------------------------------------------
describe('runReleaseEvidence — fail-closed TTY guard + no-secrets report shape (skip-safe)', () => {
  beforeEach(() => {
    jest.resetModules();
    applyEnv();
  });

  afterEach(() => {
    restoreEnv();
    restoreStdinTty();
    jest.resetModules();
  });

  test('throws (never falls back to an all-tenants run) when process.stdin.isTTY is falsy', async () => {
    const mockClose = jest.fn().mockResolvedValue(undefined);
    const mockCreateTargetConnection = jest.fn(() => ({
      query: jest.fn().mockResolvedValue([[
        {
          business_id: 'biz-1',
          database_name: 'dgfy_business_activeone',
          status: 'active',
          verified_at: new Date(),
          display_name: 'Active One',
          business_handle: 'active-one'
        }
      ]]),
      close: mockClose
    }));
    const mockCreateMetaConnection = jest.fn(() => ({ close: mockClose }));
    const mockCreateBusinessTargetConnection = jest.fn();
    const mockCheckbox = jest.fn();

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: mockCreateMetaConnection,
      createBusinessTargetConnection: mockCreateBusinessTargetConnection,
      createSourceConnection: jest.fn(),
      createLegacyTenantSourceConnection: jest.fn()
    }));
    jest.unstable_mockModule('@inquirer/prompts', () => ({
      checkbox: mockCheckbox
    }));

    setStdinTty(false);

    const { runReleaseEvidence } = await import('../src/commands/releaseEvidence.js');

    await expect(runReleaseEvidence({})).rejects.toThrow(/interactive terminal/i);

    // Never prompts and never opens a per-tenant drift connection — the
    // fail-closed guard fires before any selection/drift/migration work.
    expect(mockCheckbox).not.toHaveBeenCalled();
    expect(mockCreateBusinessTargetConnection).not.toHaveBeenCalled();
  });

  test('with invalid/missing env, runReleaseEvidence rejects with EnvValidationError and never opens a connection', async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.TARGET_DB_HOST;
    delete process.env.TARGET_DB_USER;
    delete process.env.TARGET_DB_PASSWORD;
    delete process.env.TARGET_DB_NAME;
    delete process.env.SOURCE_DB_HOST;
    delete process.env.SOURCE_DB_USER;
    delete process.env.SOURCE_DB_PASSWORD;
    delete process.env.SOURCE_DB_NAME;
    process.env.RUNTIME_MODE = 'development';

    const mockCreateTargetConnection = jest.fn();

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: jest.fn(),
      createBusinessTargetConnection: jest.fn(),
      createSourceConnection: jest.fn(),
      createLegacyTenantSourceConnection: jest.fn()
    }));

    const { runReleaseEvidence } = await import('../src/commands/releaseEvidence.js');
    const { EnvValidationError } = await import('../src/utils/errors.js');

    await expect(runReleaseEvidence({})).rejects.toBeInstanceOf(EnvValidationError);
    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
  });

  test('produces tenant_drift and migration_verification report payloads with no credential-named keys', async () => {
    const mockTargetClose = jest.fn().mockResolvedValue(undefined);
    const mockMetaClose = jest.fn().mockResolvedValue(undefined);
    const mockBusinessClose = jest.fn().mockResolvedValue(undefined);

    const mockCreateTargetConnection = jest.fn(() => ({
      query: jest.fn().mockResolvedValue([[
        {
          business_id: 'biz-1',
          database_name: 'dgfy_business_activeone',
          status: 'active',
          verified_at: new Date(),
          display_name: 'Active One',
          business_handle: 'active-one'
        }
      ]]),
      close: mockTargetClose
    }));
    const mockCreateMetaConnection = jest.fn(() => ({ close: mockMetaClose }));
    const mockCreateBusinessTargetConnection = jest.fn(() => ({ close: mockBusinessClose }));

    const driftResult = {
      database: 'dgfy_business_activeone',
      ok: true,
      tables: [{ table: 'locations', ok: true, exists: true, missing_columns: [], missing_indexes: [], missing_unique_constraints: [], missing_foreign_keys: [] }],
      rejected_tables_present: []
    };
    const migrationResult = {
      target_database: 'dgfy_business_activeone',
      kind: 'business',
      ok: true,
      expected_migrations: ['20260710021000-create-dgfy-business-foundation.cjs'],
      executed_migrations: ['20260710021000-create-dgfy-business-foundation.cjs'],
      missing_migrations: []
    };

    const mockCheckContractSchema = jest.fn().mockResolvedValue(driftResult);
    const mockCheckMigrationMetadata = jest.fn().mockResolvedValue(migrationResult);
    const mockCheckbox = jest.fn().mockResolvedValue(['dgfy_business_activeone']);

    const capturedPayloads = {};
    const mockWriteJsonReport = jest.fn((reportDir, command, payload) => {
      capturedPayloads[command] = payload;
      return Promise.resolve(`/fake/${command}.json`);
    });
    const mockWriteSummaryReport = jest.fn().mockResolvedValue('/fake/summary.txt');

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: mockCreateMetaConnection,
      createBusinessTargetConnection: mockCreateBusinessTargetConnection,
      createSourceConnection: jest.fn(),
      createLegacyTenantSourceConnection: jest.fn()
    }));
    jest.unstable_mockModule('../src/commands/verify.js', () => ({
      checkContractSchema: mockCheckContractSchema,
      checkMigrationMetadata: mockCheckMigrationMetadata
    }));
    jest.unstable_mockModule('@inquirer/prompts', () => ({
      checkbox: mockCheckbox
    }));
    jest.unstable_mockModule('../src/reports/reportWriter.js', () => ({
      writeJsonReport: mockWriteJsonReport
    }));
    jest.unstable_mockModule('../src/reports/summaryWriter.js', () => ({
      writeSummaryReport: mockWriteSummaryReport
    }));

    setStdinTty(true);

    const { runReleaseEvidence } = await import('../src/commands/releaseEvidence.js');

    const result = await runReleaseEvidence({});

    expect(mockCheckbox).toHaveBeenCalledTimes(1);
    expect(mockCheckContractSchema).toHaveBeenCalledTimes(1);
    expect(mockCheckMigrationMetadata).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);

    // Two DISTINCT, correctly-sourced reports were written — neither is a
    // relabeled copy of the other.
    expect(capturedPayloads.tenant_drift).toBeDefined();
    expect(capturedPayloads.migration_verification).toBeDefined();
    expect(capturedPayloads.tenant_drift.results).toEqual([driftResult]);
    expect(capturedPayloads.migration_verification.results).toEqual([migrationResult]);
    expect(JSON.stringify(capturedPayloads.tenant_drift)).not.toEqual(
      JSON.stringify(capturedPayloads.migration_verification)
    );

    // No-secrets report shape (T-06-01-01): no credential-named keys/values
    // anywhere in either payload.
    const serializedDrift = JSON.stringify(capturedPayloads.tenant_drift);
    const serializedMigration = JSON.stringify(capturedPayloads.migration_verification);
    [serializedDrift, serializedMigration].forEach((serialized) => {
      expect(serialized).not.toMatch(/password/i);
      expect(serialized).not.toMatch(/\bhost\b/i);
      expect(serialized).not.toMatch(/\buser\b/i);
      expect(serialized).not.toMatch(/\bdsn\b/i);
      expect(serialized).not.toMatch(/\btoken\b/i);
    });

    // Connections opened for the run are all closed.
    expect(mockTargetClose).toHaveBeenCalledTimes(1);
    expect(mockMetaClose).toHaveBeenCalledTimes(1);
    expect(mockBusinessClose).toHaveBeenCalledTimes(1);
  });

  test('zero active tenants writes a no_targets:true report and returns ok:true without prompting', async () => {
    const mockClose = jest.fn().mockResolvedValue(undefined);
    const mockCreateTargetConnection = jest.fn(() => ({
      query: jest.fn().mockResolvedValue([[]]),
      close: mockClose
    }));
    const mockCheckbox = jest.fn();
    const mockWriteJsonReport = jest.fn().mockResolvedValue('/fake/release-evidence.json');
    const mockWriteSummaryReport = jest.fn().mockResolvedValue('/fake/release-evidence.summary.txt');

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: jest.fn(),
      createBusinessTargetConnection: jest.fn(),
      createSourceConnection: jest.fn(),
      createLegacyTenantSourceConnection: jest.fn()
    }));
    jest.unstable_mockModule('@inquirer/prompts', () => ({
      checkbox: mockCheckbox
    }));
    jest.unstable_mockModule('../src/reports/reportWriter.js', () => ({
      writeJsonReport: mockWriteJsonReport
    }));
    jest.unstable_mockModule('../src/reports/summaryWriter.js', () => ({
      writeSummaryReport: mockWriteSummaryReport
    }));

    setStdinTty(false);

    const { runReleaseEvidence } = await import('../src/commands/releaseEvidence.js');
    const result = await runReleaseEvidence({});

    expect(result.no_targets).toBe(true);
    expect(result.ok).toBe(true);
    expect(mockCheckbox).not.toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// (a) CLI registration — skip-safe unit test, mirrors cliContract.test.js.
// Declared LAST: this block mocks '../src/commands/releaseEvidence.js'
// itself, and that mock registration persists across jest.resetModules()
// for the rest of this file (see file-level NOTE) — no later block needs
// the real module.
// ---------------------------------------------------------------------------
describe('cli.js — release-evidence command registration (skip-safe)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("buildProgram() registers 'release-evidence' with an --evidence-dir option", async () => {
    const mockRunReleaseEvidence = jest.fn().mockResolvedValue({});

    jest.unstable_mockModule('../src/commands/schema.js', () => ({
      runSchemaMigrate: jest.fn().mockResolvedValue({}),
      resolveTargetKind: jest.fn(),
      buildMigrationsForKind: jest.fn(() => [])
    }));
    jest.unstable_mockModule('../src/commands/data.js', () => ({
      runDataDryRun: jest.fn().mockResolvedValue({}),
      runDataApply: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/verify.js', () => ({
      runVerify: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/verifyContinuity.js', () => ({
      runVerifyContinuity: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/status.js', () => ({
      runStatus: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/rollbackPlan.js', () => ({
      runRollbackPlan: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/activateTenant.js', () => ({
      runActivateTenant: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/releaseEvidence.js', () => ({
      runReleaseEvidence: mockRunReleaseEvidence
    }));

    const { buildProgram } = await import('../src/cli.js');
    const program = buildProgram();

    const releaseEvidenceCommand = program.commands.find((cmd) => cmd.name() === 'release-evidence');
    expect(releaseEvidenceCommand).toBeDefined();

    const optionFlags = releaseEvidenceCommand.options.map((option) => option.long);
    expect(optionFlags).toContain('--evidence-dir');
  });

  test("argv ['release-evidence','--evidence-dir','/tmp/evidence'] calls runReleaseEvidence with { evidenceDir: '/tmp/evidence' }", async () => {
    const mockRunReleaseEvidence = jest.fn().mockResolvedValue({});

    jest.unstable_mockModule('../src/commands/schema.js', () => ({
      runSchemaMigrate: jest.fn().mockResolvedValue({}),
      resolveTargetKind: jest.fn(),
      buildMigrationsForKind: jest.fn(() => [])
    }));
    jest.unstable_mockModule('../src/commands/data.js', () => ({
      runDataDryRun: jest.fn().mockResolvedValue({}),
      runDataApply: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/verify.js', () => ({
      runVerify: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/verifyContinuity.js', () => ({
      runVerifyContinuity: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/status.js', () => ({
      runStatus: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/rollbackPlan.js', () => ({
      runRollbackPlan: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/activateTenant.js', () => ({
      runActivateTenant: jest.fn().mockResolvedValue({})
    }));
    jest.unstable_mockModule('../src/commands/releaseEvidence.js', () => ({
      runReleaseEvidence: mockRunReleaseEvidence
    }));

    const { buildProgram } = await import('../src/cli.js');
    const program = buildProgram();

    await program.parseAsync(['node', 'cli.js', 'release-evidence', '--evidence-dir', '/tmp/evidence']);

    expect(mockRunReleaseEvidence).toHaveBeenCalledWith({ evidenceDir: '/tmp/evidence' });
  });
});

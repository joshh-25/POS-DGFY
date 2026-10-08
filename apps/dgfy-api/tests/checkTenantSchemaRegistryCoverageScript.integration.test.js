import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');
const fixturesRoot = path.join('tests', 'fixtures', 'tenant-schema-coverage');

const runCoverageScript = ({ changedFiles, migrationsRoot, exemptionsPath, staged = false }) => {
    const args = ['scripts/check-tenant-schema-registry-coverage.js'];
    if (staged) args.push('--staged');

    return spawnSync(
        process.execPath,
        args,
        {
            cwd: backendRoot,
            env: {
                ...process.env,
                TENANT_SCHEMA_COVERAGE_CHANGED_FILES: changedFiles.join(','),
                TENANT_SCHEMA_COVERAGE_MIGRATIONS_ROOT: path.join(fixturesRoot, migrationsRoot),
                ...(exemptionsPath ? { TENANT_SCHEMA_COVERAGE_EXEMPTIONS_PATH: path.join(fixturesRoot, exemptionsPath) } : {})
            },
            encoding: 'utf8'
        }
    );
};

describe('check-tenant-schema-registry-coverage script integration', () => {
    it('passes when a changed migration only touches an already-registered column', () => {
        const result = runCoverageScript({
            changedFiles: ['apps/dgfy-migration-runner/migrations/20990101000001-add-registered-column.cjs'],
            migrationsRoot: 'healthy'
        });

        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('PASS');
    });

    it('fails when a changed migration adds a column to a tenant-scoped table with no registry entry', () => {
        const result = runCoverageScript({
            changedFiles: ['apps/dgfy-migration-runner/migrations/20990101000002-add-unregistered-column.cjs'],
            migrationsRoot: 'violating'
        });

        expect(result.status).toBe(1);
        const output = `${result.stdout}${result.stderr}`;
        expect(output).toContain("addColumn('items', 'fixture_unregistered_column')");
        expect(output).toContain('REQUIRED_TENANT_SCHEMA_COLUMNS');
    });

    // #2335 regression guard: PR #2322's migration used queryInterface.changeColumn(...) to
    // widen stock_movements.reference_type's ENUM, which this checker could not see at all
    // before the changeColumn detection added here -- it would have reported PASS on this exact
    // fixture shape. Must fail now.
    it('fails when a changed migration widens an enum column on a tenant-scoped table with no registry entry', () => {
        const result = runCoverageScript({
            changedFiles: ['apps/dgfy-migration-runner/migrations/20990101000004-change-unregistered-enum-column.cjs'],
            migrationsRoot: 'violating'
        });

        expect(result.status).toBe(1);
        const output = `${result.stdout}${result.stderr}`;
        expect(output).toContain("changeColumn('items', 'fixture_unregistered_enum_column')");
        expect(output).toContain('REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS');
    });

    it('passes when a changed migration widens an enum column that is registered in REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS', () => {
        const result = runCoverageScript({
            changedFiles: ['apps/dgfy-migration-runner/migrations/20990101000005-change-registered-enum-column.cjs'],
            migrationsRoot: 'healthy'
        });

        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('PASS');
    });

    it('passes when the same violation is explicitly exempted', () => {
        const result = runCoverageScript({
            changedFiles: ['apps/dgfy-migration-runner/migrations/20990101000002-add-unregistered-column.cjs'],
            migrationsRoot: 'violating',
            exemptionsPath: 'exemptions.fixture.js'
        });

        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('PASS');
    });

    it('warns but does not fail on a variable-driven addColumn call it cannot statically resolve', () => {
        const result = runCoverageScript({
            changedFiles: ['apps/dgfy-migration-runner/migrations/20990101000003-add-column-via-loop.cjs'],
            migrationsRoot: 'non-literal-warning'
        });

        expect(result.status).toBe(0);
        const output = `${result.stdout}${result.stderr}`;
        expect(output).toContain('Warnings');
        expect(output).toContain('non-literal');
    });

    it('exits cleanly with no violations when no migration files changed', () => {
        const result = runCoverageScript({
            changedFiles: ['apps/dgfy-api/src/models/Item.js'],
            migrationsRoot: 'healthy'
        });

        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('No migration files changed');
    });
});

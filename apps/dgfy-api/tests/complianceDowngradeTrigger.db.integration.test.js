import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Sequelize } from 'sequelize';
import { sequelize as landlordSequelize } from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');
const migrationRunnerRoot = path.join(backendRoot, '..', 'dgfy-migration-runner');
const sequelizeCliPath = path.join(migrationRunnerRoot, 'node_modules', 'sequelize-cli', 'lib', 'sequelize');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306)
};

const createIsolatedDbName = () => (
    `test_compliance_downgrade_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
);

const runMigrationsForDb = (dbName, toMigration = null) => {
    if (!fs.existsSync(sequelizeCliPath)) {
        throw new Error(`Sequelize CLI entrypoint not found at: ${sequelizeCliPath}`);
    }

    const args = [
        sequelizeCliPath,
        'db:migrate',
        '--env',
        'development',
        '--config',
        'src/config/sequelize.config.cjs',
        '--migrations-path',
        'migrations'
    ];
    if (toMigration) {
        args.push('--to', toMigration);
    }

    const migrationResult = spawnSync(
        process.execPath,
        args,
        {
            cwd: migrationRunnerRoot,
            encoding: 'utf8',
            env: {
                ...process.env,
                DB_NAME: dbName,
                DB_HOST: dbConfig.host,
                DB_USER: dbConfig.user,
                DB_PASSWORD: dbConfig.password,
                DB_PORT: String(dbConfig.port)
            }
        }
    );

    if (migrationResult.status !== 0) {
        throw new Error(
            `Migration failed for ${dbName}\n${migrationResult.stdout}\n${migrationResult.stderr}`
        );
    }
};

const expectSqlFailure = async (promiseFactory, expectedMessagePart) => {
    try {
        await promiseFactory();
        throw new Error('Expected SQL operation to fail, but it succeeded');
    } catch (error) {
        const message = String(error?.message || '');
        expect(message).toContain(expectedMessagePart);
    }
};

describe('Compliance downgrade trigger DB integration', () => {
    const dbName = createIsolatedDbName();
    let sequelize;

    beforeAll(async () => {
        await landlordSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        runMigrationsForDb(dbName, '20260422000001-add-compliance-downgrade-override-controls.cjs');

        sequelize = new Sequelize(
            dbName,
            dbConfig.user,
            dbConfig.password,
            {
                host: dbConfig.host,
                port: dbConfig.port,
                dialect: 'mysql',
                logging: false
            }
        );
        await sequelize.authenticate();

        // Seed a compliant tenant before applying hardening migration to verify backfill.
        await sequelize.query(`
            INSERT INTO tenants (
                id, name, db_name, company_token, status,
                compliance_mode_state, compliance_mode_choice_required,
                compliance_cycle_version, compliance_revert_last_cycle_version,
                created_at, updated_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000111',
                'Backfill Tenant',
                'tenant_backfill_db',
                'token-backfill-tenant',
                'active',
                'compliant_active',
                0,
                0,
                0,
                NOW(),
                NOW()
            )
        `);

        runMigrationsForDb(dbName, '20260422000002-harden-compliance-downgrade-controls.cjs');
    }, 180000);

    afterAll(async () => {
        if (sequelize) {
            await sequelize.close();
        }
        await landlordSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    }, 60000);

    it('backfills existing compliant tenants with cycle version >= 1', async () => {
        const [rows] = await sequelize.query(`
            SELECT compliance_cycle_version
            FROM tenants
            WHERE id = '00000000-0000-0000-0000-000000000111'
            LIMIT 1
        `);
        expect(rows.length).toBe(1);
        expect(Number(rows[0].compliance_cycle_version)).toBeGreaterThanOrEqual(1);
    });

    it('blocks stale-marker downgrade attempts that do not mutate governed markers in the same update', async () => {
        await sequelize.query(`
            INSERT INTO tenants (
                id, name, db_name, company_token, status,
                compliance_mode_state, compliance_mode_choice_required,
                compliance_mode_override_at, compliance_mode_override_by, compliance_mode_override_reason,
                compliance_cycle_version, compliance_revert_last_cycle_version,
                created_at, updated_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000112',
                'Stale Marker Tenant',
                'tenant_stale_marker_db',
                'token-stale-marker-tenant',
                'active',
                'compliant_active',
                0,
                NOW(),
                'platform_admin',
                'old override',
                2,
                0,
                NOW(),
                NOW()
            )
        `);

        await expectSqlFailure(
            () => sequelize.query(`
                UPDATE tenants
                SET compliance_mode_state = 'non_compliant_active'
                WHERE id = '00000000-0000-0000-0000-000000000112'
            `),
            'Compliance downgrade requires governed marker mutation in the same update'
        );
    });

    it('allows governed platform override downgrade when override markers mutate', async () => {
        await sequelize.query(`
            INSERT INTO tenants (
                id, name, db_name, company_token, status,
                compliance_mode_state, compliance_mode_choice_required,
                compliance_cycle_version, compliance_revert_last_cycle_version,
                created_at, updated_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000113',
                'Platform Override Tenant',
                'tenant_platform_override_db',
                'token-platform-override-tenant',
                'active',
                'compliant_active',
                0,
                3,
                1,
                NOW(),
                NOW()
            )
        `);

        await sequelize.query(`
            UPDATE tenants
            SET
                compliance_mode_state = 'non_compliant_active',
                compliance_mode_override_at = NOW(),
                compliance_mode_override_by = 'platform_admin',
                compliance_mode_override_reason = 'incident rollback'
            WHERE id = '00000000-0000-0000-0000-000000000113'
        `);

        const [rows] = await sequelize.query(`
            SELECT compliance_mode_state
            FROM tenants
            WHERE id = '00000000-0000-0000-0000-000000000113'
            LIMIT 1
        `);
        expect(rows[0].compliance_mode_state).toBe('non_compliant_active');
    });

    it('blocks tenant revert when one-per-cycle has already been used', async () => {
        await sequelize.query(`
            INSERT INTO tenants (
                id, name, db_name, company_token, status,
                compliance_mode_state, compliance_mode_choice_required,
                compliance_cycle_version, compliance_revert_last_cycle_version,
                created_at, updated_at
            ) VALUES (
                '00000000-0000-0000-0000-000000000114',
                'Revert Exhausted Tenant',
                'tenant_revert_exhausted_db',
                'token-revert-exhausted-tenant',
                'active',
                'compliant_active',
                0,
                4,
                4,
                NOW(),
                NOW()
            )
        `);

        await expectSqlFailure(
            () => sequelize.query(`
                UPDATE tenants
                SET
                    compliance_mode_state = 'non_compliant_active',
                    compliance_mode_revert_at = NOW(),
                    compliance_mode_revert_by = '7',
                    compliance_mode_revert_reason = 'mistake',
                    compliance_revert_last_cycle_version = 4
                WHERE id = '00000000-0000-0000-0000-000000000114'
            `),
            'Tenant revert to non-compliant already used for current compliance cycle'
        );
    });
});

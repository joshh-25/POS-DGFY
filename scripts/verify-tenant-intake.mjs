#!/usr/bin/env node
// Opt-in proof against a NEW disposable local MySQL database, never a shared/live schema.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

if (process.env.NODE_ENV !== 'test' || !/^dgfy_intake_test_[a-z0-9_]+$/.test(process.env.DB_NAME_TEST || '')
    || process.env.DB_HOST !== '127.0.0.1' || !process.env.DB_PORT || process.env.DB_PORT === '3306'
    || process.env.TENANT_INTAKE_DISPOSABLE_DB !== 'true') {
    throw new Error('Requires NODE_ENV=test, a new DB_NAME_TEST=dgfy_intake_test_<suffix>, DB_HOST=127.0.0.1, an explicit non-3306 DB_PORT, and TENANT_INTAKE_DISPOSABLE_DB=true. Use a disposable MySQL container.');
}
process.env.DB_NAME = process.env.DB_NAME_TEST;
process.env.SEED_DEMO_APPROVED = 'true';
process.env.REDIS_URL = '';
process.env.DB_AUTO_SYNC = 'false';
const require = createRequire(new URL('../apps/dgfy-api/package.json', import.meta.url));
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { Sequelize } = require('sequelize');
const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD });
const database = process.env.DB_NAME_TEST;
// CREATE without IF NOT EXISTS: refuses to use or wipe any existing schema.
await admin.query(`CREATE DATABASE \`${database}\``);
let db;
let connector;
const createdDbs = [];
try {
    db = await import('../apps/dgfy-api/src/models/index.js');
    connector = (await import('../apps/dgfy-api/src/utils/TenantConnector.js')).default;
    const { getTenantModels } = await import('../apps/dgfy-api/src/utils/tenantModelFactory.js');
    const { tenantIntakeRepository } = await import('../apps/dgfy-api/src/modules/tenantIntake/repositories/tenantIntakeRepository.js');
    const { tenantAdminRepository } = await import('../apps/dgfy-api/src/modules/tenants/repositories/tenantAdminRepository.js');
    const { dgfyAccountRepository } = await import('../apps/dgfy-api/src/modules/dgfy/repositories/dgfyAccountRepository.js');
    const { buildCreateAdminProvisionedAccountAndTenantUseCase } = await import('../apps/dgfy-api/src/modules/tenants/usecases/adminAssistedProvisioningUseCase.js');
    const { buildTenantIntakeUseCases } = await import('../apps/dgfy-api/src/modules/tenantIntake/usecases/tenantIntakeUseCases.js');
    const { buildIntakeExtractionService } = await import('../apps/dgfy-api/src/modules/tenantIntake/services/intakeExtractionService.js');
    const { provisionTenant } = await import('../apps/dgfy-api/src/services/tenantProvisioningService.js');
    const logger = { error: () => {}, warn: () => {} };
    // Fresh disposable landlord schema. Exercise migration ADD COLUMN/CREATE TABLE, not sync of the new model.
    await db.sequelize.sync();
    await db.TenantIntakeProposal.drop();
    await db.sequelize.getQueryInterface().removeColumn('tenants', 'is_demo');
    const migration = require('../dgfy-migration-runner/migrations/20261009000001-create-tenant-intake-proposals.cjs');
    await migration.up(db.sequelize.getQueryInterface(), Sequelize);
    await migration.up(db.sequelize.getQueryInterface(), Sequelize);
    assert((await db.sequelize.getQueryInterface().describeTable('tenants')).is_demo);
    const actor = { id: randomUUID(), username: 'test-human', is_master: true };
    let calls = 0;
    const provision = buildCreateAdminProvisionedAccountAndTenantUseCase({ tenantAdminRepository, dgfyAccountRepository,
        tenantConnector: connector, hashPassword: (value) => bcrypt.hash(value, 4), idGenerator: randomUUID, logger,
        provisionTenant: async (options) => {
            calls++;
            createdDbs.push(options.dbName);
            return provisionTenant(options);
        } });
    let number = 0;
    const payload = () => { number++; return { reason: 'Disposable integration proof',
        dgfy_account: { first_name: 'Test', last_name: 'Owner', email: `intake-${number}@example.test`, phone: `+63917${String(number).padStart(7, '0')}` },
        company: { name: `Intake Test ${number}`, workflowMode: 'retail' } }; };
    const extraction = buildIntakeExtractionService({ env: { OPENAI_API_KEY: 'mock' },
        getClient: () => ({ chat: { completions: { create: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload()) } }] }) } } }) });
    const cases = buildTenantIntakeUseCases({ repository: tenantIntakeRepository, provision, extract: extraction });
    const propose = async (target = 'OFFICIAL') => {
        const result = await cases.propose({ actor, body: { target, payload: payload() } });
        assert(result.success, result.error?.message); return result.data.payload.data;
    };
    const confirm = (proposal, hash = proposal.payload_hash) => cases.confirm({ actor, id: proposal.id,
        body: { human_confirmed: true, payload_hash: hash } });
    for (const target of ['OFFICIAL', 'DEMO']) {
        const before = await db.Tenant.count();
        const proposal = await propose(target);
        assert.equal(await db.Tenant.count(), before, 'proposal must not create tenants');
        assert.equal((await confirm(proposal, 'stale')).success, false);
        const results = await Promise.all([confirm(proposal), confirm(proposal)]);
        const success = results.find((result) => result.success);
        assert(success, results.map((result) => result.error?.message).join(';'));
        assert.equal(results.filter((result) => result.success).length, 1, 'exactly one concurrent confirmation wins');
        assert.equal(await db.Tenant.count(), before + 1);
        const tenant = await db.Tenant.findByPk(success.data.payload.data.provisioning.tenant.id);
        assert.equal(tenant.is_demo, target === 'DEMO'); assert.equal(tenant.status, 'active');
        const conn = await connector.getConnection(tenant);
        const tables = await conn.getQueryInterface().showAllTables();
        assert(!tables.includes('tenant_intake_proposals'), 'proposal table must never clone into tenant DB');
        assert(tables.length > 100, 'real provisioning must create the tenant schema');
        const models = getTenantModels(conn);
        assert(await models.User.findOne({ where: { is_master_admin: true } }));
        assert.equal((await confirm(proposal)).success, false, 'replay rejected');
        const persisted = await db.TenantIntakeProposal.findByPk(proposal.id);
        assert.equal(persisted.status, 'executed'); assert.equal(persisted.approved_by_admin_id, actor.id);
        const serialized = JSON.stringify(persisted.toJSON());
        assert(!serialized.includes(success.data.payload.data.provisioning.temporary_password));
        console.log(`PASS ${target}: human confirm, concurrent/replay rejection, real tenant schema (${tables.length} tables), account/user/membership, persisted target/audit`);
    }
    const before = await db.Tenant.count();
    const extractionResult = await cases.extract({ actor, body: { text: 'Business details', reason: 'Human extraction request' } });
    assert(extractionResult.success); assert.equal(await db.Tenant.count(), before, 'extract must not create tenants');
    const expired = await propose();
    await db.TenantIntakeProposal.update({ expires_at: new Date(0) }, { where: { id: expired.id } });
    assert.equal((await confirm(expired)).success, false);
    const edited = await propose(); const editResult = await cases.edit({ actor, id: edited.id, body: { payload: payload() } });
    assert(editResult.success); assert.notEqual(editResult.data.payload.data.payload_hash, edited.payload_hash);
    assert.equal((await confirm(edited)).success, false);
    const rejected = await propose(); await cases.reject({ actor, id: rejected.id });
    assert.equal((await confirm(rejected)).success, false);
    const demo = await propose('DEMO'); process.env.SEED_DEMO_APPROVED = 'false';
    assert.equal((await confirm(demo)).error.statusCode, 403);
    assert.equal((await cases.propose({ actor, body: { target: 'DEMO', payload: payload() } })).error.statusCode, 403);
    const directGuard = await provision({ actor, body: { is_demo: true } });
    assert.equal(directGuard.error.statusCode, 403);
    assert.equal(calls, 2, 'all rejected paths must leave the provision count unchanged');
    const auditRows = await db.PlatformAdminAuditLog.findAll();
    assert(auditRows.some((row) => row.action === 'tenant_intake_approved' && row.actor_admin_id === actor.id));
    assert.equal((await cases.get({ actor, id: demo.id })).data.payload.data.status, 'pending');
    console.log('PASS migration up/re-run, extraction no mutation, stale/PATCH/expired/rejected hashes, all three DEMO enforcement points, durable approval audit');
} finally {
    await connector?.closeAll();
    await db?.sequelize.close();
    for (const name of createdDbs) {
        assert(/^sku_tenant_[a-z0-9]+_[a-f0-9]+$/.test(name));
        await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    }
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
}

import { jest } from '@jest/globals';
import { buildTenantIntakeUseCases } from '../src/modules/tenantIntake/usecases/tenantIntakeUseCases.js';
import { validateProvisioningProposal, hashProposal } from '../src/modules/tenantIntake/usecases/proposalValidation.js';
import { validateAccountFields, validateTenantInput } from '../src/modules/tenants/usecases/provisioningInputRules.js';
import { demoProvisioningCapabilities } from '../src/config/demoProvisioningGuard.js';
import { buildCreateAdminProvisionedAccountAndTenantUseCase, buildCreateAdminProvisionedTenantUseCase } from '../src/modules/tenants/usecases/adminAssistedProvisioningUseCase.js';

const actor = { id: 'admin-1', username: 'operator', permissions: ['admin.tenants', 'admin.dgfy_accounts'] };
const payload = () => ({ reason: 'Operator onboarding', dgfy_account: { first_name: ' Ana ', last_name: 'Owner',
    email: ' ANA@example.test ', phone: '09171112222' }, company: { name: ' Sample Store ', workflowMode: 'retail' } });

const fixture = () => {
    const rows = new Map();
    const auditRows = [];
    let serial = Promise.resolve();
    const repository = {
        transaction: async (callback) => callback('tx'),
        create: async (values) => { const row = { id: `proposal-${rows.size}`, ...values }; rows.set(row.id, row); return { ...row }; },
        get: async (id) => rows.has(id) ? { ...rows.get(id) } : null,
        list: async () => [...rows.values()].map((row) => ({ ...row })),
        audit: jest.fn(async (values) => auditRows.push(values)),
        mutate: (id, callback) => {
            const work = serial.then(() => callback(rows.has(id) ? { ...rows.get(id) } : null,
                async (patch) => { Object.assign(rows.get(id), patch); return { ...rows.get(id) }; }, 'tx'));
            serial = work.catch(() => {});
            return work;
        }
    };
    const provision = jest.fn(async () => ({ success: true, data: { payload: { data: { tenant: { id: 'tenant-1' }, temporary_password: 'GeneratedOnce123!' } } } }));
    const extract = jest.fn(async () => ({ payload: payload(), provenance: { sha256: 'abc', model: 'test' } }));
    const useCases = buildTenantIntakeUseCases({ repository, provision, extract, now: () => new Date('2026-10-09T00:00:00Z') });
    const propose = async (target = 'OFFICIAL') => (await useCases.propose({ actor, body: { payload: payload(), target } })).data?.payload.data;
    const confirm = (proposal, body = {}) => useCases.confirm({ actor, id: proposal.id, body: { payload_hash: proposal.payload_hash, human_confirmed: true, ...body } });
    return { rows, auditRows, repository, provision, extract, useCases, propose, confirm };
};

describe('tenant intake validation and DEMO guard', () => {
    test.each([
        ['production', 'demo_db', 'true', false], ['test', 'merchant_live', 'true', false],
        ['development', 'local_db', undefined, false], ['test', 'test_db', 'TRUE', false],
        ['test', 'test_db', 'true', true], ['development', 'dgfy_dev', 'true', true],
        [undefined, 'demo_db', 'true', false]
    ])('guard %s / %s / %s = %s', (NODE_ENV, DB_NAME, SEED_DEMO_APPROVED, allowed) => {
        expect(demoProvisioningCapabilities({ NODE_ENV, DB_NAME, SEED_DEMO_APPROVED }).allowed).toBe(allowed);
    });
    test('canonical hash ignores key ordering and binds target', () => {
        expect(hashProposal('OFFICIAL', { b: 2, a: { z: 1, b: 2 } })).toBe(hashProposal('OFFICIAL', { a: { b: 2, z: 1 }, b: 2 }));
        expect(hashProposal('DEMO', payload())).not.toBe(hashProposal('OFFICIAL', payload()));
    });
    test.each(['email', 'phone', 'first_name', 'last_name'])('same account field validation rejects invalid %s', (field) => {
        const input = payload(); input.dgfy_account[field] = '';
        expect(() => validateAccountFields(input.dgfy_account)).toThrow();
        expect(validateProvisioningProposal(input).errors).not.toHaveLength(0);
    });
    test('uses the same normalizers without changing provisioning default semantics', () => {
        const input = payload();
        const account = validateAccountFields(input.dgfy_account);
        const company = validateTenantInput({ body: input.company, ownerAccount: { email: account.email, phone: account.phone, first_name: account.firstName } });
        const checked = validateProvisioningProposal(input);
        expect(checked.errors).toEqual([]);
        expect(checked.payload.dgfy_account).toMatchObject({ first_name: account.firstName, email: account.email, phone: account.phone });
        expect(checked.payload.company).toMatchObject({ name: company.name, workflowMode: company.workflowMode });
    });
    test('strips injected privileges and rejects password-bearing input', () => {
        const input = payload(); input.role = 'owner'; input.company.is_demo = true; input.company.email_verified_at = 'today';
        expect(validateProvisioningProposal(input).payload.company).toEqual({ name: 'Sample Store', workflowMode: 'retail', templateKey: null });
        input.dgfy_account.temporary_password = 'DoNotSend123!';
        expect(validateProvisioningProposal(input).payload).toBeNull();
    });
    test('ordinary business names do not look like credentials', () => {
        const input = payload(); input.company.name = 'Cookie Shop';
        expect(validateProvisioningProposal(input).errors).toEqual([]);
    });
});

describe('tenant intake state machine', () => {
    test('propose/extract create no tenant; only explicit confirmation provisions and never stores the password', async () => {
        const f = fixture(); const proposal = await f.propose();
        await f.useCases.extract({ actor, body: { reason: 'Human request', text: 'Store details' } });
        expect(f.provision).not.toHaveBeenCalled();
        expect((await f.confirm(proposal, { human_confirmed: false })).success).toBe(false);
        expect(f.provision).not.toHaveBeenCalled();
        const result = await f.confirm(proposal);
        expect(result.data.payload.data.provisioning.temporary_password).toBe('GeneratedOnce123!');
        expect(f.provision).toHaveBeenCalledTimes(1);
        expect(f.rows.get(proposal.id)).toMatchObject({ status: 'executed', approved_by_admin_id: actor.id, approved_via: 'admin_http', tenant_id: 'tenant-1' });
        expect(JSON.stringify([...f.rows.values(), ...f.auditRows])).not.toMatch(/GeneratedOnce123|temporary_password/);
        expect(f.auditRows.some((row) => row.action === 'tenant_intake_approved')).toBe(true);
        expect((await f.confirm(proposal)).error.statusCode).toBe(409);
    });
    test('concurrent confirms produce one provisioning call', async () => {
        const f = fixture(); const proposal = await f.propose();
        const results = await Promise.all([f.confirm(proposal), f.confirm(proposal)]);
        expect(results.filter((result) => result.success)).toHaveLength(1);
        expect(f.provision).toHaveBeenCalledTimes(1);
    });
    test('PATCH changes hash and stale/corrupted hashes cannot provision', async () => {
        const f = fixture(); const proposal = await f.propose();
        const edited = payload(); edited.company.name = 'Other Store';
        const result = await f.useCases.edit({ actor, id: proposal.id, body: { payload: edited } });
        expect(result.data.payload.data.payload_hash).not.toBe(proposal.payload_hash);
        expect((await f.confirm(proposal)).success).toBe(false);
        const current = result.data.payload.data;
        f.rows.get(proposal.id).payload_json.company.name = 'Tampered';
        expect((await f.confirm(current)).success).toBe(false);
        expect(f.provision).not.toHaveBeenCalled();
    });
    test.each(['rejected', 'expired', 'failed', 'executing', 'executed'])('cannot reuse a %s proposal', async (status) => {
        const f = fixture(); const proposal = await f.propose(); f.rows.get(proposal.id).status = status;
        expect((await f.confirm(proposal)).error.statusCode).toBe(409);
        expect((await f.useCases.edit({ actor, id: proposal.id, body: { payload: payload() } })).success).toBe(false);
        expect(f.provision).not.toHaveBeenCalled();
    });
    test('expired pending proposals are visible as expired and reject confirmation/edit', async () => {
        const f = fixture(); const proposal = await f.propose(); f.rows.get(proposal.id).expires_at = new Date('2026-10-08');
        expect((await f.confirm(proposal)).success).toBe(false);
        expect((await f.useCases.get({ actor, id: proposal.id })).data.payload.data.status).toBe('expired');
        expect(f.provision).not.toHaveBeenCalled();
    });
    test('rejection is terminal and recorded', async () => {
        const f = fixture(); const proposal = await f.propose();
        expect((await f.useCases.reject({ actor, id: proposal.id })).success).toBe(true);
        expect(f.auditRows.at(-1).action).toBe('tenant_intake_rejected');
        expect((await f.confirm(proposal)).success).toBe(false);
    });
    test('list rejects malformed limits before repository access', async () => {
        const f = fixture();
        for (const limit of ['invalid', '2.5', '0', '101']) {
            expect((await f.useCases.list({ actor, query: { limit } })).error.statusCode).toBe(400);
        }
    });
    test('failed partial provisioning keeps tenant id but no raw infrastructure detail and cannot replay', async () => {
        const f = fixture(); const proposal = await f.propose();
        f.provision.mockResolvedValue({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Sensitive SQL', details: { tenant_id: 'retained-tenant', partial_state: true, retryable: true } } });
        expect((await f.confirm(proposal)).success).toBe(false);
        expect(f.rows.get(proposal.id)).toMatchObject({ status: 'failed', tenant_id: 'retained-tenant', failure_detail: { partial_state: true } });
        expect(JSON.stringify(f.rows.get(proposal.id))).not.toContain('Sensitive SQL');
        expect((await f.confirm(proposal)).success).toBe(false);
    });
    test.each([{ permissions: [] }, { permissions: ['admin.tenants'] }, { permissions: ['admin.dgfy_accounts'] }])('denies missing combined permissions %j before extraction or mutation', async ({ permissions }) => {
        const f = fixture();
        expect((await f.useCases.propose({ actor: { ...actor, permissions }, body: { payload: payload() } })).error.statusCode).toBe(403);
        expect((await f.useCases.extract({ actor: { ...actor, permissions }, body: {} })).error.statusCode).toBe(403);
        expect(f.extract).not.toHaveBeenCalled(); expect(f.rows.size).toBe(0);
    });
    test.each([
        { key: 'NODE_ENV', value: 'production' }, { key: 'DB_NAME', value: 'merchant_live' },
        { key: 'SEED_DEMO_APPROVED', value: 'false' }
    ])('DEMO refused at all three enforcement points when $key=$value', async ({ key, value }) => {
        const saved = { NODE_ENV: process.env.NODE_ENV, DB_NAME: process.env.DB_NAME, SEED_DEMO_APPROVED: process.env.SEED_DEMO_APPROVED };
        try {
            process.env.NODE_ENV = 'test'; process.env.DB_NAME = 'intake_test'; process.env.SEED_DEMO_APPROVED = 'true';
            const f = fixture(); const proposal = await f.propose('DEMO');
            process.env[key] = value;
            expect((await f.useCases.propose({ actor, body: { payload: payload(), target: 'DEMO' } })).error.statusCode).toBe(403);
            expect((await f.confirm(proposal)).error.statusCode).toBe(403);
            expect(f.provision).not.toHaveBeenCalled();
            for (const build of [buildCreateAdminProvisionedAccountAndTenantUseCase, buildCreateAdminProvisionedTenantUseCase]) {
                const provisionTenant = jest.fn();
                const direct = build({ provisionTenant, logger: { error: jest.fn() } });
                expect((await direct({ body: { is_demo: true } })).error.statusCode).toBe(403);
                expect(provisionTenant).not.toHaveBeenCalled();
            }
        } finally {
            for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
        }
    });
});

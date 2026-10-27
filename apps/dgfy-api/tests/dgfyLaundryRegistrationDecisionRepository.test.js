import { afterEach, describe, expect, it, jest } from '@jest/globals';
import sequelize from '../src/config/database.js';
import { DgfyAccount, DgfyAccountTenantMembership, Tenant } from '../src/models/index.js';
import { dgfyLaundryRepository } from '../src/modules/dgfyLaundry/repositories/dgfyLaundryRepository.js';

const issuer = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const applicant = { id: '3f7a49a3-2f9b-4c32-9839-607f468ed4f4', email: 'owner@example.test', phone: '+639171234567', is_active: true, deleted_at: null };
const makeIntent = (overrides = {}) => ({
    id: '1af6fd22-0765-4df4-babe-5e722173e543',
    intent_type: 'registration',
    status: 'pending',
    status_version: 1,
    company_access_version: 0,
    decision: null,
    decision_expected_version: null,
    decision_reason: null,
    applicant_issuer: issuer,
    applicant_subject: applicant.id,
    payload: JSON.stringify({ organizationName: 'Laundry Company', branchName: 'Main Branch', issuer, subject: applicant.id }),
    ...overrides
});

afterEach(() => jest.restoreAllMocks());

describe('DGLaundry registration decision repository', () => {
    it('creates the company, provider location, accepted owner membership, version, and audit in one transaction', async () => {
        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const company = { id: '11111111-1111-4111-8111-111111111111' };
        const membership = { id: 42 };
        const pending = makeIntent();
        const authority = {
            row: { ...pending, status: 'approved', decision: 'approve', status_version: 2, company_access_version: 1 },
            issuer,
            subject: applicant.id,
            account: applicant,
            company,
            membership,
            location: { id: '22222222-2222-4222-8222-222222222222', status: 'active' },
            payload: { organizationName: 'Laundry Company', branchName: 'Main Branch' },
            businessMode: 'laundry'
        };

        jest.spyOn(sequelize, 'transaction').mockImplementation(async (callback) => callback(transaction));
        jest.spyOn(sequelize, 'query').mockImplementation(async (sql) => {
            if (String(sql).includes('SELECT * FROM dgfy_dglaundry_intents')) return [pending];
            if (String(sql).includes('UPDATE dgfy_dglaundry_intents')) return [undefined, { affectedRows: 1 }];
            return [undefined, { affectedRows: 1 }];
        });
        jest.spyOn(DgfyAccount, 'findByPk').mockResolvedValue(applicant);
        jest.spyOn(Tenant, 'create').mockResolvedValue(company);
        jest.spyOn(DgfyAccountTenantMembership, 'create').mockResolvedValue(membership);
        jest.spyOn(dgfyLaundryRepository, 'findRegistrationIntentAuthority').mockResolvedValue(authority);

        const result = await dgfyLaundryRepository.decideRegistrationIntent({
            intentId: pending.id,
            decision: 'approve',
            expectedStatusVersion: 1,
            adminId: 'admin-1'
        });

        expect(result).toMatchObject({ idempotentReplay: false, authority });
        expect(sequelize.transaction).toHaveBeenCalledTimes(1);
        expect(Tenant.create).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Laundry Company',
            status: 'active',
            owner_dgfy_account_id: applicant.id,
            settings: expect.objectContaining({ business_mode: 'laundry', runtime_owner: 'dglaundry', ims: false, pos: false })
        }), { transaction });
        expect(DgfyAccountTenantMembership.create).toHaveBeenCalledWith(expect.objectContaining({
            dgfy_account_id: applicant.id,
            tenant_id: company.id,
            role: 'owner',
            status: 'accepted'
        }), { transaction });
        expect(sequelize.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO dgfy_dglaundry_provider_locations'), expect.objectContaining({ transaction }));
        expect(sequelize.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE dgfy_dglaundry_intents'), expect.objectContaining({ transaction }));
        expect(sequelize.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO dgfy_dglaundry_audit_logs'), expect.objectContaining({ transaction }));
        for (const [, options] of sequelize.query.mock.calls) expect(options.transaction).toBe(transaction);
    });

    it.each([
        ['reject', 'rejected'],
        ['request_correction', 'correction_required']
    ])('%s records a decision without provisioning company, location, or membership records', async (decision, status) => {
        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const pending = makeIntent();
        jest.spyOn(sequelize, 'transaction').mockImplementation(async (callback) => callback(transaction));
        jest.spyOn(sequelize, 'query').mockImplementation(async (sql) => {
            if (String(sql).includes('SELECT * FROM dgfy_dglaundry_intents')) return [pending];
            return [undefined, { affectedRows: 1 }];
        });
        const authority = { row: { ...pending, status, decision, status_version: 2, company_access_version: 0 }, payload: {}, issuer, subject: applicant.id, company: null, membership: null, location: null, account: applicant, businessMode: 'laundry' };
        jest.spyOn(dgfyLaundryRepository, 'findRegistrationIntentAuthority').mockResolvedValue(authority);
        const createCompany = jest.spyOn(Tenant, 'create');
        const createMembership = jest.spyOn(DgfyAccountTenantMembership, 'create');

        await dgfyLaundryRepository.decideRegistrationIntent({ intentId: pending.id, decision, expectedStatusVersion: 1, reason: 'Needs another review.' });

        expect(createCompany).not.toHaveBeenCalled();
        expect(createMembership).not.toHaveBeenCalled();
        expect(sequelize.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO dgfy_dglaundry_provider_locations'))).toBe(false);
        expect(sequelize.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO dgfy_dglaundry_audit_logs'), expect.objectContaining({ transaction }));
    });

    it('rejects stale versions before provisioning and returns an exact retry without repeating writes', async () => {
        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const staleIntent = makeIntent({ status_version: 2 });
        jest.spyOn(sequelize, 'transaction').mockImplementation(async (callback) => callback(transaction));
        const query = jest.spyOn(sequelize, 'query').mockResolvedValue([staleIntent]);
        const createCompany = jest.spyOn(Tenant, 'create');
        await expect(dgfyLaundryRepository.decideRegistrationIntent({ intentId: staleIntent.id, decision: 'approve', expectedStatusVersion: 1 }))
            .rejects.toMatchObject({ code: 'DGLAUNDRY_REGISTRATION_STALE_VERSION' });
        expect(query).toHaveBeenCalledTimes(1);
        expect(createCompany).not.toHaveBeenCalled();

        jest.restoreAllMocks();
        const recorded = makeIntent({ status: 'approved', status_version: 2, decision: 'approve', decision_expected_version: 1, decision_reason: null });
        const retryTransaction = { LOCK: { UPDATE: 'UPDATE' } };
        jest.spyOn(sequelize, 'transaction').mockImplementation(async (callback) => callback(retryTransaction));
        jest.spyOn(sequelize, 'query').mockResolvedValue([recorded]);
        const authority = { row: recorded };
        jest.spyOn(dgfyLaundryRepository, 'findRegistrationIntentAuthority').mockResolvedValue(authority);
        const retry = await dgfyLaundryRepository.decideRegistrationIntent({ intentId: recorded.id, decision: 'approve', expectedStatusVersion: 1 });
        expect(retry).toEqual({ idempotentReplay: true, authority });
        expect(sequelize.query).toHaveBeenCalledTimes(1);
    });
});

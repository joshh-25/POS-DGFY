import { buildDgfyLaundryProviderUseCases } from '../src/modules/dgfyLaundry/usecases/dgfyLaundryProviderUseCases.js';
import { jest } from '@jest/globals';

const account = { id: 'account-1', email: 'owner@example.test', first_name: 'Demo', last_name: 'Owner' };
const issuer = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const makeRegistrationAuthority = (overrides = {}) => ({
    row: {
        id: 'intent-1', intent_type: 'registration', status: 'pending', decision: null,
        status_version: 1, company_access_version: 0, decision_reason: null,
        expires_at: new Date('2026-11-26T00:00:00Z')
    },
    payload: { organizationName: 'Laundry A', branchName: 'Main', branchCode: 'MAIN' },
    issuer,
    subject: account.id,
    account: { ...account, is_active: true, deleted_at: null },
    company: null,
    membership: null,
    location: null,
    businessMode: 'laundry',
    ...overrides
});
const companies = [
    { company_id: 'company-a', company_name: 'Laundry A', membership_id: 11, membership_status: 'accepted', role: 'admin', business_mode: 'laundry', runtime_owner: 'dglaundry', dgfy_storefront: true, ims: false, pos: false, operations_url: 'https://laundry.surebizcorp.com', status: 'active' },
    { company_id: 'company-b', company_name: 'Laundry B', membership_id: 12, membership_status: 'accepted', role: 'staff', business_mode: 'laundry', runtime_owner: 'dglaundry', dgfy_storefront: true, ims: false, pos: false, operations_url: 'https://laundry.surebizcorp.com', status: 'active' }
];

const makeRepository = () => ({
    listLaundryCompanies: jest.fn(async () => companies),
    findCompanyById: jest.fn(async () => null),
    listMappings: jest.fn(async () => [{ dgfy_location_id: 'location-a', dglaundry_branch_id: 'branch-a', mapping_version: 2, status: 'active' }]),
    listProviderLocations: jest.fn(async () => []),
    audit: jest.fn(async () => {}),
    findActiveApplicant: jest.fn(async ({ issuer: requestedIssuer, subject }) => requestedIssuer === issuer && subject === account.id ? { ...account, is_active: true, deleted_at: null } : null),
    createIntent: jest.fn(async (input) => ({ row: { id: 'intent-1', intent_type: input.intentType, status: 'pending', idempotency_key: input.idempotencyKey, expires_at: input.expiresAt, payload: input.payload, status_version: 1, company_access_version: 0, applicant_issuer: input.applicantIssuer, applicant_subject: input.applicantSubject }, created: true })),
    findIntent: jest.fn(async () => ({ id: 'intent-1', intent_type: 'registration', status: 'pending', payload: '{"organizationName":"Laundry A","branchName":"Main"}' })),
    findRegistrationIntentAuthority: jest.fn(async () => makeRegistrationAuthority()),
    listRegistrationIntents: jest.fn(async () => ({ items: [], total: 0 })),
    decideRegistrationIntent: jest.fn(async () => ({ idempotentReplay: false, authority: makeRegistrationAuthority({
        row: { ...makeRegistrationAuthority().row, status: 'approved', decision: 'approve', status_version: 2, company_access_version: 1 },
        company: { id: 'company-a', status: 'active', settings: { business_mode: 'laundry', runtime_owner: 'dglaundry' } },
        membership: { id: 21, status: 'accepted' },
        location: { id: 'location-a', status: 'active' }
    }) })),
    createMapping: jest.fn(async () => ({ id: 'mapping-1', status: 'active' }))
});

describe('DGLaundry provider foundation use cases', () => {
    it('returns the provider health and supported signature capabilities', async () => {
        const useCases = buildDgfyLaundryProviderUseCases({ repository: makeRepository() });
        await expect(useCases.health()).resolves.toEqual(expect.objectContaining({
            status: 'ok', provider: 'dgfy', contractVersion: expect.any(String), time: expect.any(String)
        }));
        await expect(useCases.capabilities()).resolves.toEqual(expect.objectContaining({
            provider: 'dgfy',
            contractVersion: expect.any(String),
            signatureProfiles: [
                { scope: 'request', tag: 'dgfy-external-runtime-v1', algorithm: 'ecdsa-p256-sha256' },
                { scope: 'event', tag: 'dglaundry-dgfy-v1', algorithm: 'ed25519' }
            ],
            enforcedProfile: expect.any(String)
        }));
    });

    it('does not expose a missing or non-qualifying company', async () => {
        const repository = makeRepository();
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.getCompanyById({ companyId: 'unknown' })).rejects.toMatchObject({ statusCode: 404 });
        repository.findCompanyById.mockResolvedValueOnce(null); // inactive or non-DGLaundry tenants are filtered by the repository
        await expect(useCases.getCompanyById({ companyId: 'other-tenant' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('returns a qualifying company with its owner and active location mappings', async () => {
        const repository = makeRepository();
        repository.findCompanyById.mockResolvedValue({
            company_id: 'company-a', company_name: 'Laundry A', membership_id: 11,
            dgfy_account_id: 'owner-1', role: 'owner', status: 'active',
            business_mode: 'laundry', runtime_owner: 'dglaundry'
        });
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.getCompanyById({ companyId: 'company-a' })).resolves.toMatchObject({
            company_id: 'company-a',
            owner: { membershipId: '11', dgfyAccountId: 'owner-1', role: 'owner' },
            locations: [{ locationId: 'location-a', branchId: 'branch-a', status: 'active' }]
        });
        expect(repository.listMappings).toHaveBeenCalledWith({ dgfyCompanyId: 'company-a' });
    });

    it('does not guess when an account has multiple laundry companies', async () => {
        const useCases = buildDgfyLaundryProviderUseCases({ repository: makeRepository() });
        await expect(useCases.launch({ dgfyAccount: account })).resolves.toMatchObject({ selection_required: true, companies });
    });

    it('requires an accepted active laundry membership for launch', async () => {
        const repository = makeRepository();
        repository.listLaundryCompanies.mockResolvedValue([]);
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.launch({ dgfyAccount: account, companyId: 'company-a' })).rejects.toMatchObject({ statusCode: 403 });
    });

    it('does not substitute a sole accepted company for an invalid explicit selector', async () => {
        const repository = makeRepository();
        repository.listLaundryCompanies.mockResolvedValue([companies[0]]);
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.launch({ dgfyAccount: account, companyId: 'not-company-a' }))
            .rejects.toMatchObject({ statusCode: 403 });
    });

    describe('launch origin comes from configuration (#2513)', () => {
        const savedBaseUrl = process.env.DGLAUNDRY_PARTNER_BASE_URL;
        afterEach(() => {
            if (savedBaseUrl === undefined) delete process.env.DGLAUNDRY_PARTNER_BASE_URL;
            else process.env.DGLAUNDRY_PARTNER_BASE_URL = savedBaseUrl;
        });

        it.each([
            ['https://dglaundry.dgfy.ph', 'https://dglaundry.dgfy.ph'],
            ['https://dglaundry.stage.dgfy.ph/', 'https://dglaundry.stage.dgfy.ph']
        ])('returns the configured DGLaundry origin for %s and records the launch audit', async (configured, expected) => {
            process.env.DGLAUNDRY_PARTNER_BASE_URL = configured;
            const repository = makeRepository();
            const useCases = buildDgfyLaundryProviderUseCases({ repository });
            await expect(useCases.launch({ dgfyAccount: account, companyId: 'company-a', branchId: 'branch-a' })).resolves.toMatchObject({ url: expected, company: { company_id: 'company-a' } });
            expect(repository.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'laundry_operations_launch', companyId: 'company-a' }));
        });

        it.each([undefined, '', 'not a url'])('refuses to launch, without auditing, when the origin is %p', async (configured) => {
            if (configured === undefined) delete process.env.DGLAUNDRY_PARTNER_BASE_URL;
            else process.env.DGLAUNDRY_PARTNER_BASE_URL = configured;
            const repository = makeRepository();
            const useCases = buildDgfyLaundryProviderUseCases({ repository });
            await expect(useCases.launch({ dgfyAccount: account, companyId: 'company-a', branchId: 'branch-a' })).rejects.toMatchObject({ statusCode: 503 });
            expect(repository.audit).not.toHaveBeenCalled();
        });
    });

    it('returns an issuer+subject session context with explicit location mappings', async () => {
        const useCases = buildDgfyLaundryProviderUseCases({ repository: makeRepository() });
        await expect(useCases.sessionContext({ dgfyAccount: account, companyId: 'company-a' })).resolves.toMatchObject({ issuer: expect.stringMatching(/^https:\/\//), subject: 'account-1', companyId: 'company-a', company: { businessMode: 'laundry', runtimeOwner: 'dglaundry' }, locations: [{ locationId: 'location-a', branchId: 'branch-a' }] });
    });

    it('uses bounded idempotency keys for registration intents', async () => {
        const repository = makeRepository();
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.createIntent({ intentType: 'registration', dgfyAccount: account, body: { idempotency_key: 'registration-1', issuer, subject: account.id, organizationName: 'A', branchName: 'Main', company_id: 'forged-company' } })).resolves.toMatchObject({ intentId: 'intent-1', status: 'pending', companyId: null, locationId: null, membershipId: null, issuer, subject: account.id, membershipStatus: 'not_created', companyStatus: 'not_created', statusVersion: 1, companyAccessVersion: 0 });
        expect(repository.createIntent).toHaveBeenCalledWith(expect.objectContaining({
            dgfyAccountId: account.id,
            applicantIssuer: issuer,
            applicantSubject: account.id,
            tenantId: null,
            payload: expect.not.objectContaining({ company_id: 'forged-company' })
        }));
        await expect(useCases.createIntent({ intentType: 'registration', dgfyAccount: account, body: {} })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('requires an exact active DGFY issuer and subject for registration, ignoring caller account IDs', async () => {
        const repository = makeRepository();
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.createIntent({ intentType: 'registration', body: { idempotencyKey: 'registration-2', dgfy_account_id: account.id } }))
            .rejects.toMatchObject({ statusCode: 422 });
        await expect(useCases.createIntent({ intentType: 'registration', body: { idempotencyKey: 'registration-3', issuer: 'https://attacker.test', subject: account.id } }))
            .rejects.toMatchObject({ statusCode: 422 });
        repository.findActiveApplicant.mockResolvedValueOnce(null);
        await expect(useCases.createIntent({ intentType: 'registration', body: { idempotencyKey: 'registration-4', issuer, subject: 'unresolved-subject' } }))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(repository.createIntent).not.toHaveBeenCalled();
    });

    it('returns only durable DGFY approval IDs and versions from registration status', async () => {
        const repository = makeRepository();
        repository.findRegistrationIntentAuthority.mockResolvedValueOnce(makeRegistrationAuthority({
            row: { ...makeRegistrationAuthority().row, status: 'approved', decision: 'approve', status_version: 7, company_access_version: 2 },
            company: { id: 'company-a', status: 'active', settings: { business_mode: 'laundry', runtime_owner: 'dglaundry' } },
            membership: { id: 33, status: 'accepted' },
            location: { id: 'provider-location-a', status: 'active' }
        }));
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.getIntent({ id: 'intent-1', expectedIntentType: 'registration' })).resolves.toEqual(expect.objectContaining({
            intentId: 'intent-1', status: 'approved', companyId: 'company-a', locationId: 'provider-location-a', membershipId: '33',
            issuer, subject: account.id, membershipStatus: 'accepted', companyStatus: 'active', businessMode: 'laundry',
            connectionStatus: 'active', statusVersion: 7, companyAccessVersion: 2
        }));
        expect(repository.findRegistrationIntentAuthority).toHaveBeenCalledWith({ id: 'intent-1' });
    });

    it('lists, reviews, and records admin decisions with reason and optimistic version', async () => {
        const repository = makeRepository();
        repository.listRegistrationIntents.mockResolvedValueOnce({ items: [{ intentId: 'intent-1' }], total: 1 });
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.listRegistrationIntents({ search: 'asdsad', status: 'pending', limit: '10', offset: '0' }))
            .resolves.toEqual({ items: [{ intentId: 'intent-1' }], total: 1 });
        expect(repository.listRegistrationIntents).toHaveBeenCalledWith({ search: 'asdsad', status: 'pending', limit: 10, offset: 0 });
        await expect(useCases.getRegistrationIntentForAdmin({ intentId: 'intent-1' })).resolves.toMatchObject({
            applicant: { email: account.email, identityVerified: true },
            payload: { organizationName: 'Laundry A', branchName: 'Main' }
        });
        await expect(useCases.decideRegistrationIntent({ intentId: 'intent-1', decision: 'approve', expectedStatusVersion: 1, adminId: 'admin-1' }))
            .resolves.toMatchObject({ status: 'approved', idempotentReplay: false, companyAccessVersion: 1 });
        expect(repository.decideRegistrationIntent).toHaveBeenCalledWith(expect.objectContaining({ intentId: 'intent-1', decision: 'approve', expectedStatusVersion: 1, adminId: 'admin-1' }));
        await expect(useCases.decideRegistrationIntent({ intentId: 'intent-1', decision: 'reject', expectedStatusVersion: 1 }))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it('surfaces stale admin decisions as conflicts and preserves negative decisions without provisioning fields', async () => {
        const repository = makeRepository();
        repository.decideRegistrationIntent.mockRejectedValueOnce(Object.assign(new Error('stale'), { code: 'DGLAUNDRY_REGISTRATION_STALE_VERSION' }));
        repository.decideRegistrationIntent.mockResolvedValueOnce({ idempotentReplay: false, authority: makeRegistrationAuthority({
            row: { ...makeRegistrationAuthority().row, status: 'correction_required', decision: 'request_correction', status_version: 2, company_access_version: 0, decision_reason: 'Please update your business details.' }
        }) });
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.decideRegistrationIntent({ intentId: 'intent-1', decision: 'approve', expectedStatusVersion: 1 }))
            .rejects.toMatchObject({ statusCode: 409 });
        await expect(useCases.decideRegistrationIntent({ intentId: 'intent-1', decision: 'request_correction', expectedStatusVersion: 1, reason: 'Please update your business details.' }))
            .resolves.toMatchObject({ status: 'correction_required', companyId: null, locationId: null, membershipId: null, companyAccessVersion: 0 });
    });

    it('does not return an intent through a route for a different intent type', async () => {
        const useCases = buildDgfyLaundryProviderUseCases({ repository: makeRepository() });

        await expect(useCases.getIntent({ id: 'intent-1', expectedIntentType: 'location' }))
            .rejects.toMatchObject({ statusCode: 404 });
        await expect(useCases.getIntent({ id: 'intent-1', expectedIntentType: 'registration' }))
            .resolves.toMatchObject({ intentId: 'intent-1', intentType: 'registration' });
    });
});

import { buildDgfyLaundryProviderUseCases } from '../src/modules/dgfyLaundry/usecases/dgfyLaundryProviderUseCases.js';
import { jest } from '@jest/globals';

const account = { id: 'account-1', email: 'owner@example.test', first_name: 'Demo', last_name: 'Owner' };
const companies = [
    { company_id: 'company-a', company_name: 'Laundry A', membership_id: 11, membership_status: 'accepted', role: 'admin', business_mode: 'laundry', runtime_owner: 'dglaundry', dgfy_storefront: true, ims: false, pos: false, operations_url: 'https://laundry.surebizcorp.com', status: 'active' },
    { company_id: 'company-b', company_name: 'Laundry B', membership_id: 12, membership_status: 'accepted', role: 'staff', business_mode: 'laundry', runtime_owner: 'dglaundry', dgfy_storefront: true, ims: false, pos: false, operations_url: 'https://laundry.surebizcorp.com', status: 'active' }
];

const makeRepository = () => ({
    listLaundryCompanies: jest.fn(async () => companies),
    findCompanyById: jest.fn(async () => null),
    listMappings: jest.fn(async () => [{ dgfy_location_id: 'location-a', dglaundry_branch_id: 'branch-a', mapping_version: 2, status: 'active' }]),
    audit: jest.fn(async () => {}),
    createIntent: jest.fn(async (input) => ({ id: 'intent-1', intent_type: input.intentType, status: 'pending', idempotency_key: input.idempotencyKey, expires_at: input.expiresAt })),
    findIntent: jest.fn(async () => ({ id: 'intent-1', intent_type: 'registration', status: 'pending', payload: '{"company_name":"A"}' })),
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

    it('returns the fixed DGLaundry operations origin and records the launch audit', async () => {
        const repository = makeRepository();
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.launch({ dgfyAccount: account, companyId: 'company-a', branchId: 'branch-a' })).resolves.toMatchObject({ url: 'https://laundry.surebizcorp.com', company: { company_id: 'company-a' } });
        expect(repository.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'laundry_operations_launch', companyId: 'company-a' }));
    });

    it('returns an issuer+subject session context with explicit location mappings', async () => {
        const useCases = buildDgfyLaundryProviderUseCases({ repository: makeRepository() });
        await expect(useCases.sessionContext({ dgfyAccount: account, companyId: 'company-a' })).resolves.toMatchObject({ issuer: expect.stringMatching(/^https:\/\//), subject: 'account-1', companyId: 'company-a', company: { businessMode: 'laundry', runtimeOwner: 'dglaundry' }, locations: [{ locationId: 'location-a', branchId: 'branch-a' }] });
    });

    it('uses bounded idempotency keys for registration intents', async () => {
        const repository = makeRepository();
        const useCases = buildDgfyLaundryProviderUseCases({ repository });
        await expect(useCases.createIntent({ intentType: 'registration', dgfyAccount: account, body: { idempotency_key: 'registration-1', company_name: 'A' } })).resolves.toMatchObject({ intentId: 'intent-1', status: 'pending' });
        await expect(useCases.createIntent({ intentType: 'registration', dgfyAccount: account, body: {} })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('does not return an intent through a route for a different intent type', async () => {
        const useCases = buildDgfyLaundryProviderUseCases({ repository: makeRepository() });

        await expect(useCases.getIntent({ id: 'intent-1', expectedIntentType: 'location' }))
            .rejects.toMatchObject({ statusCode: 404 });
        await expect(useCases.getIntent({ id: 'intent-1', expectedIntentType: 'registration' }))
            .resolves.toMatchObject({ intentId: 'intent-1', intentType: 'registration' });
    });
});

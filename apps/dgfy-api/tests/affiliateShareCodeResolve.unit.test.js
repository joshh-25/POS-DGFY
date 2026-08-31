// Unit tests for #452 (Phase 212): the /s/{short_code} resolve use case and the
// path-only buildAffiliateShareUrl rewrite in dgfyAffiliateUseCases.js.
//
// No database is used: buildResolveAffiliateShareCodeUseCase accepts `repository` as an
// injectable parameter, so a plain in-memory fake stands in for dgfyAffiliateRepository.js --
// mirrors the existing pure-unit pattern used by affiliateCommissionAccrual.unit.test.js.

import {
    buildResolveAffiliateShareCodeUseCase,
    buildAffiliateShareUrl
} from '../src/modules/dgfy/usecases/dgfyAffiliateUseCases.js';

const TENANT_ID = 'tenant-1';

const makeFakeRepository = ({
    settings = { program_enabled: true },
    enrollment = null,
    affiliateSlug = 'mystore-a1b2c3'
} = {}) => {
    const calls = { findActiveEnrollmentByShortCode: 0, getSettings: 0, getStorefrontAffiliateSlug: 0 };

    return {
        __calls: calls,

        async findActiveEnrollmentByShortCode(shortCode) {
            calls.findActiveEnrollmentByShortCode += 1;
            if (!enrollment) return null;
            return enrollment.short_code === shortCode ? enrollment : null;
        },

        async getSettings(tenantId) {
            calls.getSettings += 1;
            return tenantId === TENANT_ID ? settings : { program_enabled: true };
        },

        async getStorefrontAffiliateSlug(tenantId) {
            calls.getStorefrontAffiliateSlug += 1;
            return tenantId === TENANT_ID ? affiliateSlug : null;
        }
    };
};

const ACTIVE_ENROLLMENT = {
    enrollment_id: 'enr-1',
    tenant_id: TENANT_ID,
    dgfy_account_id: 'acct-1',
    short_code: 'AF-ABC234',
    status: 'active'
};

describe('buildResolveAffiliateShareCodeUseCase (#452, Phase 212)', () => {
    it('T1: a valid active code resolves to { resolved: true, store_slug }', async () => {
        const repository = makeFakeRepository({ enrollment: ACTIVE_ENROLLMENT });
        const resolve = buildResolveAffiliateShareCodeUseCase({ repository });

        const result = await resolve({ shortCode: 'AF-ABC234' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            resolved: true,
            store_slug: 'mystore-a1b2c3',
            short_code: 'AF-ABC234'
        });
    });

    it('T2: an unknown code returns ok({ resolved: false }) -- HTTP 200 posture, never a 4xx', async () => {
        const repository = makeFakeRepository({ enrollment: null });
        const resolve = buildResolveAffiliateShareCodeUseCase({ repository });

        const result = await resolve({ shortCode: 'AF-ZZZZZZ' });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ resolved: false });
    });

    it('T3: an enrollment that is not active never surfaces (fake repository already filters by status, mirroring the real query)', async () => {
        const repository = makeFakeRepository({ enrollment: null });
        const resolve = buildResolveAffiliateShareCodeUseCase({ repository });

        const result = await resolve({ shortCode: 'AF-SUSPND' });

        expect(result.data).toEqual({ resolved: false });
    });

    it('T4: program_enabled: false short-circuits to resolved: false, and never calls getStorefrontAffiliateSlug', async () => {
        const repository = makeFakeRepository({
            enrollment: ACTIVE_ENROLLMENT,
            settings: { program_enabled: false }
        });
        const resolve = buildResolveAffiliateShareCodeUseCase({ repository });

        const result = await resolve({ shortCode: 'AF-ABC234' });

        expect(result.data).toEqual({ resolved: false });
        expect(repository.__calls.getStorefrontAffiliateSlug).toBe(0);
    });

    it('T5: a tenant with no discovery-index row (null slug) resolves to resolved: false', async () => {
        const repository = makeFakeRepository({ enrollment: ACTIVE_ENROLLMENT, affiliateSlug: null });
        const resolve = buildResolveAffiliateShareCodeUseCase({ repository });

        const result = await resolve({ shortCode: 'AF-ABC234' });

        expect(result.data).toEqual({ resolved: false });
    });

    it('T6: an empty/malformed code resolves to resolved: false with zero repository calls', async () => {
        const repository = makeFakeRepository({ enrollment: ACTIVE_ENROLLMENT });
        const resolve = buildResolveAffiliateShareCodeUseCase({ repository });

        const result = await resolve({ shortCode: '   ' });

        expect(result.data).toEqual({ resolved: false });
        expect(repository.__calls.findActiveEnrollmentByShortCode).toBe(0);
        expect(repository.__calls.getSettings).toBe(0);
        expect(repository.__calls.getStorefrontAffiliateSlug).toBe(0);
    });

    it('T7: a resolved response contains no tenant_id, enrollment_id, or affiliate identity -- exact key set', async () => {
        const repository = makeFakeRepository({ enrollment: ACTIVE_ENROLLMENT });
        const resolve = buildResolveAffiliateShareCodeUseCase({ repository });

        const result = await resolve({ shortCode: 'AF-ABC234' });

        expect(Object.keys(result.data).sort()).toEqual(['resolved', 'short_code', 'store_slug']);
    });
});

describe('buildAffiliateShareUrl (#452, Phase 212) -- path-only, ?p= retired from emission', () => {
    const ORIGINAL_ORIGIN = process.env.STOREFRONT_PUBLIC_ORIGIN;

    afterEach(() => {
        process.env.STOREFRONT_PUBLIC_ORIGIN = ORIGINAL_ORIGIN;
    });

    it('T8: emits /s/{short_code} -- no ?p=, no slug segment', () => {
        process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://dgfy.ph';
        const { path, url } = buildAffiliateShareUrl({ shortCode: 'AF-ABC234' });
        expect(path).toBe('/s/AF-ABC234');
        expect(url).toBe('https://dgfy.ph/s/AF-ABC234');
        expect(path).not.toContain('?p=');
    });

    it('T9: with STOREFRONT_PUBLIC_ORIGIN unset, returns { path, url: null }', () => {
        delete process.env.STOREFRONT_PUBLIC_ORIGIN;
        const { path, url } = buildAffiliateShareUrl({ shortCode: 'AF-ABC234' });
        expect(path).toBe('/s/AF-ABC234');
        expect(url).toBeNull();
    });

    it('T10: a lowercase code is uppercased in the emitted path', () => {
        process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://dgfy.ph';
        const { path } = buildAffiliateShareUrl({ shortCode: 'af-abc234' });
        expect(path).toBe('/s/AF-ABC234');
    });

    it('an empty/missing code returns { path: null, url: null }', () => {
        const { path, url } = buildAffiliateShareUrl({ shortCode: '' });
        expect(path).toBeNull();
        expect(url).toBeNull();
    });
});

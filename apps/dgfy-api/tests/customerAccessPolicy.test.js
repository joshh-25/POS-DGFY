import {
    applyInventoryDisplayPolicy,
    buildAccessCapabilities,
    buildGuestCheckoutDisabledError,
    isCustomerAccessModesEnabled,
    normalizeCashPaymentEnabled,
    normalizeCustomerAccessMode,
    normalizeGuestCheckoutEnabled,
    normalizeInventoryDisplayMode,
    resolveAccessPolicyFromSettings,
    resolveDefaultGuestCheckoutEnabledForWorkflowMode,
    resolveEffectiveCustomerAccessMode
} from '../src/modules/shared/utils/customerAccessPolicy.js';

describe('customerAccessPolicy', () => {
    const originalEnabled = process.env.CUSTOMER_ACCESS_MODES_ENABLED;
    const originalTenantAllowlist = process.env.CUSTOMER_ACCESS_MODES_ENABLED_TENANTS;

    afterEach(() => {
        if (originalEnabled === undefined) {
            delete process.env.CUSTOMER_ACCESS_MODES_ENABLED;
        } else {
            process.env.CUSTOMER_ACCESS_MODES_ENABLED = originalEnabled;
        }
        if (originalTenantAllowlist === undefined) {
            delete process.env.CUSTOMER_ACCESS_MODES_ENABLED_TENANTS;
        } else {
            process.env.CUSTOMER_ACCESS_MODES_ENABLED_TENANTS = originalTenantAllowlist;
        }
    });

    it('normalizes supported modes and falls back conservatively', () => {
        expect(normalizeCustomerAccessMode('Inquiry')).toBe('inquiry');
        expect(normalizeCustomerAccessMode('bad')).toBe('catalog');
        expect(normalizeInventoryDisplayMode('LOW_STOCK')).toBe('low_stock');
        expect(normalizeInventoryDisplayMode('bad')).toBe('availability');
    });

    it('caps effective mode by registration stage when enforcement is enabled', () => {
        const informal = resolveEffectiveCustomerAccessMode({
            requestedMode: 'transaction',
            registrationStage: 'informal',
            featureEnabled: true
        });
        expect(informal.effective_customer_access_mode).toBe('catalog');
        expect(informal.max_customer_access_mode).toBe('catalog');
        expect(informal.access_capabilities.checkout).toBe(false);

        const registered = resolveEffectiveCustomerAccessMode({
            requestedMode: 'transaction',
            registrationStage: 'registered',
            featureEnabled: true
        });
        expect(registered.effective_customer_access_mode).toBe('transaction');
        expect(registered.access_capabilities.checkout).toBe(true);
    });

    it('preserves requested transaction while exposing a catalog effective cap from onboarding progress', () => {
        const resolved = resolveAccessPolicyFromSettings({
            customer_access_mode: 'transaction',
            tenant_onboarding_progress: {
                step_payloads: {
                    business_classification: {
                        legitimacy: { registration_status: 'informal' }
                    }
                }
            }
        });

        expect(resolved.requested_customer_access_mode).toBe('transaction');
        expect(resolved.effective_customer_access_mode).toBe('catalog');
        expect(resolved.max_customer_access_mode).toBe('catalog');
        expect(resolved.limitation_reason).toBe('Registration stage informal allows up to catalog mode.');
        expect(resolved.access_capabilities.checkout).toBe(false);
    });

    it('caps requested mode by platform maximum even when registration permits transaction', () => {
        const resolved = resolveAccessPolicyFromSettings({
            customer_access_mode: 'transaction',
            platform_max_customer_access_mode: 'inquiry',
            tenant_onboarding_progress: {
                step_payloads: {
                    business_classification: {
                        legitimacy: { registration_status: 'registered' }
                    }
                }
            }
        });

        expect(resolved.requested_customer_access_mode).toBe('transaction');
        expect(resolved.platform_max_customer_access_mode).toBe('inquiry');
        expect(resolved.registration_stage_max_customer_access_mode).toBe('transaction');
        expect(resolved.effective_customer_access_mode).toBe('inquiry');
        expect(resolved.max_customer_access_mode).toBe('inquiry');
        expect(resolved.limitation_reason).toBe('Platform maximum allows up to inquiry mode.');
        expect(resolved.access_capabilities.checkout).toBe(false);
    });

    it('enforces saved modes by default when no rollout flag is configured', () => {
        const resolved = resolveAccessPolicyFromSettings({
            customer_access_mode: 'ghost',
            tenant_onboarding_progress: {
                step_payloads: {
                    business_classification: {
                        legitimacy: { registration_status: 'informal' }
                    }
                }
            }
        });

        expect(resolved.customer_access_mode).toBe('ghost');
        expect(resolved.effective_customer_access_mode).toBe('ghost');
        expect(resolved.access_capabilities.catalog).toBe(false);
        expect(resolved.access_capabilities.checkout).toBe(false);
        expect(resolved.customer_access_modes_enabled).toBe(true);
    });

    it('supports explicit rollback to transaction-capable compatibility behavior', () => {
        const resolved = resolveAccessPolicyFromSettings({
            customer_access_mode: 'ghost',
            tenant_onboarding_progress: {
                step_payloads: {
                    business_classification: {
                        legitimacy: { registration_status: 'informal' }
                    }
                }
            }
        }, { featureEnabled: false });

        expect(resolved.customer_access_mode).toBe('ghost');
        expect(resolved.effective_customer_access_mode).toBe('transaction');
        expect(resolved.access_capabilities.checkout).toBe(true);
    });

    it('supports tenant-scoped rollout allowlist while global enforcement remains off', () => {
        process.env.CUSTOMER_ACCESS_MODES_ENABLED = 'false';
        process.env.CUSTOMER_ACCESS_MODES_ENABLED_TENANTS = 'tenant-a, demo-slug';

        expect(isCustomerAccessModesEnabled({ tenantId: 'tenant-a' })).toBe(true);
        expect(isCustomerAccessModesEnabled({ slug: 'demo-slug' })).toBe(true);
        expect(isCustomerAccessModesEnabled({ tenantId: 'tenant-b' })).toBe(false);
    });

    it('builds expected capability matrix', () => {
        expect(buildAccessCapabilities('ghost')).toEqual(expect.objectContaining({
            catalog: false,
            checkout: false,
            contact: true
        }));
        expect(buildAccessCapabilities('transaction')).toEqual(expect.objectContaining({
            catalog: true,
            checkout: true,
            booking: true
        }));
    });

    it('formats inventory display without exposing raw stock fields', () => {
        expect(applyInventoryDisplayPolicy({ current_stock: 2, availability_status: 'in_stock' }, {
            inventory_display_mode: 'low_stock',
            inventory_low_stock_display_threshold: 3
        })).toEqual({
            mode: 'low_stock',
            label: 'Only 2 left',
            display_quantity: 2
        });
        expect(applyInventoryDisplayPolicy({ current_stock: 12, availability_status: 'in_stock' }, {
            inventory_display_mode: 'exact_quantity'
        })).toEqual({
            mode: 'exact_quantity',
            label: '12 available',
            display_quantity: 12
        });
        expect(applyInventoryDisplayPolicy({ current_stock: 12, availability_status: 'in_stock' }, {
            inventory_display_mode: 'hidden'
        })).toEqual({
            mode: 'hidden',
            label: null
        });
    });

    // #622
    describe('guest checkout enabled', () => {
        it('defaults to enabled when unset -- every tenant provisioned before this shipped', () => {
            expect(resolveAccessPolicyFromSettings({}).guest_checkout_enabled).toBe(true);
            expect(normalizeGuestCheckoutEnabled(undefined)).toBe(true);
        });

        it('normalizes the stored string form the settings repository persists booleans as', () => {
            expect(normalizeGuestCheckoutEnabled('true')).toBe(true);
            expect(normalizeGuestCheckoutEnabled('false')).toBe(false);
            expect(normalizeGuestCheckoutEnabled('garbage')).toBe(true);
        });

        it('resolves the explicit setting value from a raw settings row', () => {
            expect(resolveAccessPolicyFromSettings({
                storefront_guest_checkout_enabled: { value: false }
            }).guest_checkout_enabled).toBe(false);
            expect(resolveAccessPolicyFromSettings({
                storefront_guest_checkout_enabled: { value: true }
            }).guest_checkout_enabled).toBe(true);
        });

        it('resolves the vertical-dependent provisioning default -- disabled only for retail', () => {
            expect(resolveDefaultGuestCheckoutEnabledForWorkflowMode('retail')).toBe(false);
            expect(resolveDefaultGuestCheckoutEnabledForWorkflowMode('fnb')).toBe(true);
            expect(resolveDefaultGuestCheckoutEnabledForWorkflowMode('msme')).toBe(true);
            expect(resolveDefaultGuestCheckoutEnabledForWorkflowMode(undefined)).toBe(true);
        });

        it('builds a 403 error carrying the GUEST_CHECKOUT_DISABLED reason code', () => {
            const error = buildGuestCheckoutDisabledError();
            expect(error.statusCode).toBe(403);
            expect(error.details.reason_code).toBe('GUEST_CHECKOUT_DISABLED');
        });
    });

    // #626 (Phase 203)
    describe('cash payment enabled', () => {
        it('defaults to enabled when unset -- every tenant provisioned before this shipped', () => {
            expect(resolveAccessPolicyFromSettings({}).cash_payment_enabled).toBe(true);
            expect(normalizeCashPaymentEnabled(undefined)).toBe(true);
        });

        it('normalizes the stored string form the settings repository persists booleans as', () => {
            expect(normalizeCashPaymentEnabled('true')).toBe(true);
            expect(normalizeCashPaymentEnabled('false')).toBe(false);
            expect(normalizeCashPaymentEnabled('garbage')).toBe(true);
        });

        it('resolves cash_payment_enabled: false only for an explicit false, true for missing/null', () => {
            expect(resolveAccessPolicyFromSettings({
                storefront_cash_payment_enabled: { value: false }
            }).cash_payment_enabled).toBe(false);
            expect(resolveAccessPolicyFromSettings({
                storefront_cash_payment_enabled: { value: true }
            }).cash_payment_enabled).toBe(true);
            expect(resolveAccessPolicyFromSettings({
                storefront_cash_payment_enabled: { value: null }
            }).cash_payment_enabled).toBe(true);
            expect(resolveAccessPolicyFromSettings({}).cash_payment_enabled).toBe(true);
        });
    });
});

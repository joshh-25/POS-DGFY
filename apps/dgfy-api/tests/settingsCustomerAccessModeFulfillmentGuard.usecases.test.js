import { jest } from '@jest/globals';
import { buildUpdateSettingsUseCase } from '../src/modules/settings/usecases/updateSettingsUseCase.js';
import { buildUpdateSettingByKeyUseCase } from '../src/modules/settings/usecases/updateSettingByKeyUseCase.js';
import { assertNoUnfulfillableLocationForTransactionMode } from '../src/modules/settings/usecases/customerAccessModeFulfillmentPolicy.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

// #1093 follow-up (PR #1096 review, RF-1): tenantLocationUseCases.js's own guard only stops a
// location-level write from CREATING a store with no fulfillment method -- it has no way to stop
// the other direction: a settings write that flips customer_access_mode to 'transaction' while a
// location already sits at both-off (a legitimate prior state under Catalog Only). These pin the
// settings-side close of that gap.
const unfulfillableLocation = { location_id: 7, name: 'Both-Off Branch', supports_delivery: false, supports_pickup: false };
const fulfillableLocation = { location_id: 8, name: 'Delivery Branch', supports_delivery: true, supports_pickup: false };

// Mirrors storeUsecases.applicationResult.test.js's own registeredTransactionSettings() fixture.
// Without a 'registered' registration stage, resolveAccessPolicyFromSettings caps effective mode
// at 'catalog' regardless of the requested value (registrationStageMax for 'informal' is
// 'catalog') -- this is what makes a request for 'transaction' actually resolve to 'transaction'.
const registeredOnboardingSettings = () => ({
    tenant_onboarding_progress: {
        value: {
            step_payloads: {
                business_classification: {
                    legitimacy: { registration_status: 'registered' }
                }
            }
        }
    }
});

describe('assertNoUnfulfillableLocationForTransactionMode (pure)', () => {
    it('does nothing outside transaction mode, regardless of location state', () => {
        expect(() => assertNoUnfulfillableLocationForTransactionMode({
            effectiveCustomerAccessMode: 'catalog',
            locations: [unfulfillableLocation]
        })).not.toThrow();
    });

    it('throws when transaction mode and a location has neither method enabled', () => {
        expect(() => assertNoUnfulfillableLocationForTransactionMode({
            effectiveCustomerAccessMode: 'transaction',
            locations: [fulfillableLocation, unfulfillableLocation]
        })).toThrow(expect.objectContaining({ code: DomainErrorCode.VALIDATION_FAILED }));
    });

    it('allows transaction mode when every location has at least one method enabled', () => {
        expect(() => assertNoUnfulfillableLocationForTransactionMode({
            effectiveCustomerAccessMode: 'transaction',
            locations: [fulfillableLocation]
        })).not.toThrow();
    });
});

describe('updateSettingsUseCase (bulk PUT /settings) -- customer_access_mode transition guard', () => {
    it('rejects switching to transaction mode while a location has neither method enabled', async () => {
        const listLocations = jest.fn().mockResolvedValue([unfulfillableLocation]);
        const getSettingsByKeys = jest.fn().mockResolvedValue(registeredOnboardingSettings());
        const useCase = buildUpdateSettingsUseCase({
            settingsRepository: { getSettingsByKeys, updateSettings: jest.fn() },
            tenantLocationRepository: { listLocations }
        });

        const result = await useCase({ settingsData: { customer_access_mode: 'transaction' } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
        expect(listLocations).toHaveBeenCalledWith({ includeInactive: false });
    });

    it('allows switching to Catalog Only even with a location that has neither method enabled', async () => {
        const listLocations = jest.fn();
        const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
        const useCase = buildUpdateSettingsUseCase({
            settingsRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({}),
                updateSettings
            },
            tenantLocationRepository: { listLocations }
        });

        const result = await useCase({ settingsData: { customer_access_mode: 'catalog' } });

        expect(result.success).toBe(true);
        // Catalog never resolves to 'transaction', so the location check short-circuits before
        // ever querying locations.
        expect(listLocations).not.toHaveBeenCalled();
    });

    it('never queries locations for a settings write that does not touch customer_access_mode', async () => {
        const listLocations = jest.fn();
        const updateSettings = jest.fn().mockResolvedValue({ updated: 1 });
        const useCase = buildUpdateSettingsUseCase({
            settingsRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({}),
                updateSettings
            },
            tenantLocationRepository: { listLocations }
        });

        const result = await useCase({ settingsData: { timezone: 'Asia/Manila' } });

        expect(result.success).toBe(true);
        expect(listLocations).not.toHaveBeenCalled();
    });
});

describe('updateSettingByKeyUseCase (single-key PUT /settings/:key) -- same guard', () => {
    it('rejects switching to transaction mode while a location has neither method enabled', async () => {
        const listLocations = jest.fn().mockResolvedValue([unfulfillableLocation]);
        const useCase = buildUpdateSettingByKeyUseCase({
            settingsRepository: { getSettingsByKeys: jest.fn().mockResolvedValue(registeredOnboardingSettings()) },
            tenantLocationRepository: { listLocations }
        });

        const result = await useCase({ key: 'customer_access_mode', value: 'transaction' });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(listLocations).toHaveBeenCalledWith({ includeInactive: false });
    });

    it('allows switching to delivery-only availability then to transaction mode (Surebiz order)', async () => {
        const listLocations = jest.fn().mockResolvedValue([fulfillableLocation]);
        const updateSettingByKey = jest.fn().mockResolvedValue({ setting_key: 'customer_access_mode', value: 'transaction' });
        const useCase = buildUpdateSettingByKeyUseCase({
            settingsRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue(registeredOnboardingSettings()),
                updateSettingByKey
            },
            tenantLocationRepository: { listLocations }
        });

        const result = await useCase({ key: 'customer_access_mode', value: 'transaction' });

        expect(result.success).toBe(true);
        expect(listLocations).toHaveBeenCalledWith({ includeInactive: false });
    });
});

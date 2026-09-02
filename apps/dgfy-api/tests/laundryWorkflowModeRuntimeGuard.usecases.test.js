import { jest } from '@jest/globals';
import { buildUpdateSettingsUseCase } from '../src/modules/settings/usecases/updateSettingsUseCase.js';
import { buildUpdateSettingByKeyUseCase } from '../src/modules/settings/usecases/updateSettingByKeyUseCase.js';
import { assertLaundryWorkflowModeRuntimeOwnership } from '../src/modules/settings/usecases/laundryWorkflowModeRuntimeGuard.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import dbStore from '../src/utils/dbStore.js';

const masterAdmin = { is_master_admin: true, tenant_id: 'tenant-retail' };

const makeTenantRepository = (settings) => ({
    findById: jest.fn().mockResolvedValue({ id: 'tenant-retail', settings })
});

describe('laundry workflow mode runtime ownership guard', () => {
    it('rejects bulk laundry workflow mode for a non-laundry tenant before persistence', async () => {
        const updateSettings = jest.fn();
        const tenantRepository = makeTenantRepository({ business_mode: 'retail', runtime_owner: 'dgfy' });
        const useCase = buildUpdateSettingsUseCase({
            settingsRepository: { updateSettings },
            tenantRepository
        });

        const result = await dbStore.run({ tenantId: 'tenant-retail' }, () => useCase({
            settingsData: { ops_workflow_mode: 'laundry' },
            actorUser: masterAdmin
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(result.error.statusCode).toBe(409);
        expect(result.error.details).toEqual({ reason_code: 'LAUNDRY_WORKFLOW_MODE_RUNTIME_MISMATCH' });
        expect(updateSettings).not.toHaveBeenCalled();
        expect(tenantRepository.findById).toHaveBeenCalledWith('tenant-retail', { attributes: ['id', 'settings'] });
    });

    it('rejects single-key laundry workflow mode for a non-laundry tenant before persistence', async () => {
        const updateSettingByKey = jest.fn();
        const tenantRepository = makeTenantRepository({ business_mode: 'retail', runtime_owner: 'dgfy' });
        const useCase = buildUpdateSettingByKeyUseCase({
            settingsRepository: { updateSettingByKey },
            tenantRepository
        });

        const result = await dbStore.run({ tenantId: 'tenant-retail' }, () => useCase({
            key: 'ops_workflow_mode',
            value: 'laundry',
            actorUser: masterAdmin
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(result.error.statusCode).toBe(409);
        expect(updateSettingByKey).not.toHaveBeenCalled();
    });

    it('allows the mode only when immutable laundry ownership is present', async () => {
        const tenantRepository = makeTenantRepository({ business_mode: 'laundry', runtime_owner: 'dglaundry' });

        await expect(dbStore.run({ tenantId: 'tenant-retail' }, () => assertLaundryWorkflowModeRuntimeOwnership({
            requestedMode: 'laundry',
            actorUser: masterAdmin,
            tenantRepository
        }))).resolves.toBeUndefined();
    });
});


import { describe, expect, it, jest } from '@jest/globals';
import { buildGetAllSettingsUseCase } from '../src/modules/settings/usecases/getAllSettingsUseCase.js';
import { buildGetSettingByKeyUseCase } from '../src/modules/settings/usecases/getSettingByKeyUseCase.js';
import { buildUpdateSettingsUseCase } from '../src/modules/settings/usecases/updateSettingsUseCase.js';
import { buildUpdateSettingByKeyUseCase } from '../src/modules/settings/usecases/updateSettingByKeyUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import {
    assertPosTaxpayerTypeReadyForFiscalIssuance,
    buildPosTaxpayerTypeReadProjection
} from '../src/modules/settings/usecases/posTaxpayerTypePolicy.js';

describe('POS taxpayer type server policy', () => {
    it('projects a legacy alias without changing the raw setting', () => {
        const projection = buildPosTaxpayerTypeReadProjection({
            value: 'VAT_REGISTERED',
            updated_at: '2026-10-26T00:00:00.000Z'
        });

        expect(projection.pos_taxpayer_type_resolved.value).toBe('vat_registered');
        expect(projection.pos_taxpayer_type_resolved.source).toBe('runtime');
        expect(projection.pos_fiscal_setup_readiness.value).toEqual({
            status: 'configured',
            taxpayer_type: 'vat_registered',
            reason_code: null
        });
    });

    it.each([
        [undefined, 'not_configured'],
        ['', 'not_configured'],
        ['legacy_unknown', 'needs_review']
    ])('reports %s as %s', (value, status) => {
        const projection = buildPosTaxpayerTypeReadProjection({ value });
        expect(projection.pos_fiscal_setup_readiness.value.status).toBe(status);
        expect(projection.pos_taxpayer_type_resolved.value).toBeNull();
    });

    it('adds read-only readiness projections to settings reads', async () => {
        const getAll = buildGetAllSettingsUseCase({
            settingsRepository: {
                getAllSettings: jest.fn().mockResolvedValue({ pos_taxpayer_type: { value: 'non-vat' } })
            },
            customerAccessModesEnabledProvider: jest.fn().mockReturnValue(true)
        });
        const getOne = buildGetSettingByKeyUseCase({
            settingsRepository: {
                getSettingByKey: jest.fn().mockResolvedValue({ value: 'non-vat' })
            }
        });

        const allResult = await getAll();
        const oneResult = await getOne({ key: 'pos_taxpayer_type' });

        expect(allResult.data.pos_taxpayer_type.value).toBe('non-vat');
        expect(allResult.data.pos_taxpayer_type_resolved.value).toBe('non_vat_registered');
        expect(allResult.data.pos_fiscal_setup_readiness.value.status).toBe('configured');
        expect(oneResult.data.value).toBe('non-vat');
        expect(oneResult.data.resolved_value).toBe('non_vat_registered');
        expect(oneResult.data.readiness.status).toBe('configured');
    });

    it('rejects invalid taxpayer values in both direct settings use cases before persistence', async () => {
        const updateSettings = jest.fn();
        const updateSettingByKey = jest.fn();
        const bulk = buildUpdateSettingsUseCase({ settingsRepository: { updateSettings } });
        const single = buildUpdateSettingByKeyUseCase({ settingsRepository: { updateSettingByKey } });

        const bulkResult = await bulk({ settingsData: { pos_taxpayer_type: 'legacy_unknown' } });
        const singleResult = await single({ key: 'pos_taxpayer_type', value: 'legacy_unknown' });

        expect(bulkResult.success).toBe(false);
        expect(singleResult.success).toBe(false);
        expect(bulkResult.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(singleResult.error.details.reason_code).toBe('POS_TAXPAYER_TYPE_UNRECOGNIZED');
        expect(updateSettings).not.toHaveBeenCalled();
        expect(updateSettingByKey).not.toHaveBeenCalled();
    });

    it.each(['VAT', 'VAT_REGISTERED', 'non-vat'])('allows recognized value %s at fiscal issuance', (value) => {
        expect(assertPosTaxpayerTypeReadyForFiscalIssuance({
            pos_taxpayer_type: { value }
        }).status).toBe('configured');
    });

    it('blocks fiscal issuance when the value is blank or unknown', () => {
        for (const value of ['', 'legacy_unknown']) {
            expect(() => assertPosTaxpayerTypeReadyForFiscalIssuance({
                pos_taxpayer_type: { value }
            })).toThrow(expect.objectContaining({
                code: DomainErrorCode.VALIDATION_FAILED,
                details: expect.objectContaining({ reason_code: 'FISCAL_SETUP_INCOMPLETE' })
            }));
        }
    });
});

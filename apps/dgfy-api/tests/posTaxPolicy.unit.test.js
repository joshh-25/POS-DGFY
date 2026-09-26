import { jest } from '@jest/globals';
import {
    normalizePosTaxPolicies,
    resolvePosTaxPolicy,
    shouldRemovePosTaxVat
} from '../src/modules/shared/constants/posTaxPolicy.js';
import { resolvePosTaxPolicyAuditBeforeValue } from '../src/modules/settings/usecases/posTaxPolicyAuditLog.js';

describe('POS tax policy contract', () => {
    test('preserves statutory defaults and standard treatment for other categories', () => {
        const policy = normalizePosTaxPolicies(null);

        expect(policy.categories.senior.vat_treatment).toBe('vat_exempt');
        expect(policy.categories.pwd.vat_treatment).toBe('vat_exempt');
        expect(policy.categories.manual.vat_treatment).toBe('standard');
        expect(resolvePosTaxPolicy(policy, 'voucher')).toMatchObject({
            type: 'voucher',
            vat_treatment: 'standard',
            version: 1
        });
    });

    test('normalizes invalid or partial input without allowing unknown categories to affect checkout', () => {
        const policy = normalizePosTaxPolicies({
            version: 4,
            categories: {
                employee: { vat_treatment: 'vat_exempt' },
                unknown: { vat_treatment: 'vat_exempt' }
            }
        });

        expect(policy.version).toBe(4);
        expect(policy.categories.employee.vat_treatment).toBe('vat_exempt');
        expect(policy.categories.promo.vat_treatment).toBe('standard');
        expect(policy.categories.unknown).toBeUndefined();
        expect(shouldRemovePosTaxVat(policy, 'employee')).toBe(true);
        expect(shouldRemovePosTaxVat(policy, 'unknown')).toBe(false);
    });

    test('allows the first settings save when the policy row does not exist yet', async () => {
        await expect(resolvePosTaxPolicyAuditBeforeValue({
            settingsRepository: {
                getSettingByKey: jest.fn().mockRejectedValue(new Error('Setting not found'))
            },
            settingsData: {
                pos_tax_policies: normalizePosTaxPolicies(null)
            }
        })).resolves.toBeNull();
    });
});

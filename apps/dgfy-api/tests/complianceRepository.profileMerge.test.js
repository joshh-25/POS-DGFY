import dbStore from '../src/utils/dbStore.js';
import { complianceRepository } from '../src/modules/compliance/repositories/complianceRepository.js';
import { jest } from '@jest/globals';

describe('complianceRepository.updateComplianceProfile', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('merges partial nested patches into stringified existing compliance_profile without wiping untouched fields', async () => {
        const existingProfile = {
            bir: {
                software_accreditation_number: 'BIR-ACC-001',
                mandatory_receipt_fields_confirmed: true
            },
            npc: {
                dpo_name: 'Jane DPO'
            }
        };

        const tenantInstance = {
            id: 101,
            compliance_profile: JSON.stringify(existingProfile),
            update: jest.fn(async ({ compliance_profile }) => {
                tenantInstance.compliance_profile = compliance_profile;
                return tenantInstance;
            }),
            toJSON: () => ({
                id: 101,
                compliance_mode_state: 'compliant_pending'
            })
        };

        const Tenant = {
            findByPk: jest.fn().mockResolvedValue(tenantInstance)
        };

        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'Tenant') return Tenant;
            throw new Error(`Unexpected model lookup: ${name}`);
        });

        const patch = {
            npc: {
                dpo_email: 'dpo@example.com'
            },
            readiness: {
                tests_passed: true
            }
        };

        const result = await complianceRepository.updateComplianceProfile(tenantInstance.id, patch);

        expect(Tenant.findByPk).toHaveBeenCalledWith(tenantInstance.id, {
            transaction: undefined,
            lock: undefined
        });
        expect(tenantInstance.update).toHaveBeenCalledWith({
            compliance_profile: {
                bir: {
                    software_accreditation_number: 'BIR-ACC-001',
                    mandatory_receipt_fields_confirmed: true
                },
                npc: {
                    dpo_name: 'Jane DPO',
                    dpo_email: 'dpo@example.com'
                },
                readiness: {
                    tests_passed: true
                }
            }
        }, {
            transaction: undefined
        });

        expect(result).toEqual({
            tenant: {
                id: 101,
                compliance_mode_state: 'compliant_pending'
            },
            compliance_profile: {
                bir: {
                    software_accreditation_number: 'BIR-ACC-001',
                    mandatory_receipt_fields_confirmed: true
                },
                npc: {
                    dpo_name: 'Jane DPO',
                    dpo_email: 'dpo@example.com'
                },
                readiness: {
                    tests_passed: true
                }
            }
        });
    });
});

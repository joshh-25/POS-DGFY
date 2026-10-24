import { describe, expect, it, jest, beforeEach, beforeAll } from '@jest/globals';

const getModel = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: { get: getModel }
}));

let businessAdminCompanyRepository;

const buildTransaction = () => ({ LOCK: { UPDATE: 'UPDATE' } });

describe('business admin company repository', () => {
    let tenant;
    let posSetting;
    let Tenant;
    let SystemSetting;
    let TenantAdminAuditLog;

    beforeAll(async () => {
        ({ businessAdminCompanyRepository } = await import('../src/modules/businessAdmin/repositories/businessAdminCompanyRepository.js'));
    });

    beforeEach(() => {
        tenant = {
            id: 'tenant-1',
            name: 'Old Business',
            update: jest.fn(async (values) => {
                Object.assign(tenant, values);
                return tenant;
            })
        };
        posSetting = {
            setting_key: 'pos_business_name',
            setting_value: 'Old Business',
            data_type: 'string',
            description: 'POS business display name',
            update: jest.fn(async (values) => {
                Object.assign(posSetting, values);
                return posSetting;
            }),
            destroy: jest.fn(async () => {
                posSetting = null;
            })
        };

        Tenant = {
            findByPk: jest.fn(async () => tenant),
            sequelize: {
                transaction: jest.fn(async (callback) => callback(buildTransaction()))
            }
        };
        SystemSetting = {
            findOne: jest.fn(async () => posSetting),
            create: jest.fn(async (values) => {
                posSetting = {
                    ...values,
                    update: jest.fn(async (updates) => {
                        Object.assign(posSetting, updates);
                        return posSetting;
                    }),
                    destroy: jest.fn(async () => {
                        posSetting = null;
                    })
                };
                return posSetting;
            }),
            sequelize: {
                transaction: jest.fn(async (callback) => callback(buildTransaction()))
            }
        };
        TenantAdminAuditLog = { create: jest.fn(async (values) => values) };

        getModel.mockImplementation((modelName) => ({
            Tenant,
            SystemSetting,
            TenantAdminAuditLog
        }[modelName]));
        getModel.mockClear();
    });

    it('updates the canonical tenant name and POS display setting together', async () => {
        const result = await businessAdminCompanyRepository.updateCanonicalName({
            tenantId: tenant.id,
            name: 'New Business',
            audit: { actorUsername: 'admin@example.com', requestId: 'req-1' }
        });

        expect(result).toMatchObject({
            status: 'updated',
            name: 'New Business',
            previous_name: 'Old Business',
            canonical_name_changed: true,
            pos_business_name_changed: true,
            pos_business_name: 'New Business'
        });
        expect(tenant.name).toBe('New Business');
        expect(posSetting.setting_value).toBe('New Business');
        expect(TenantAdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            before_snapshot: { name: 'Old Business', pos_business_name: 'Old Business' },
            after_snapshot: { name: 'New Business', pos_business_name: 'New Business' }
        }), expect.anything());
    });

    it('restores the POS display setting when the landlord update fails', async () => {
        const failure = new Error('landlord database unavailable');
        Tenant.sequelize.transaction.mockRejectedValueOnce(failure);

        await expect(businessAdminCompanyRepository.updateCanonicalName({
            tenantId: tenant.id,
            name: 'New Business'
        })).rejects.toBe(failure);

        expect(posSetting.setting_value).toBe('Old Business');
        expect(tenant.name).toBe('Old Business');
        expect(TenantAdminAuditLog.create).not.toHaveBeenCalled();
    });

    it('does not create an audit row when both names are already synchronized', async () => {
        const result = await businessAdminCompanyRepository.updateCanonicalName({
            tenantId: tenant.id,
            name: 'Old Business'
        });

        expect(result).toMatchObject({
            status: 'unchanged',
            canonical_name_changed: false,
            pos_business_name_changed: false
        });
        expect(TenantAdminAuditLog.create).not.toHaveBeenCalled();
    });
});

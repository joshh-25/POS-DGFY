import { jest } from '@jest/globals';
import { buildMaterializeApprovedCompanyRegistration } from '../src/modules/tenants/usecases/materializeApprovedCompanyRegistration.js';

const buildModels = () => {
    const settings = new Map();
    const locations = [];
    const SystemSetting = {
        findOne: jest.fn(async ({ where }) => settings.get(where.setting_key) || null),
        create: jest.fn(async (values) => {
            const row = {
                ...values,
                update: jest.fn(async (next) => Object.assign(row, next))
            };
            settings.set(values.setting_key, row);
            return row;
        })
    };
    const TenantLocation = {
        findOne: jest.fn(async () => locations.find((location) => location.is_primary_storefront) || null),
        create: jest.fn(async (values) => {
            const row = { location_id: locations.length + 1, ...values, update: jest.fn(async (next) => Object.assign(row, next)) };
            locations.push(row);
            return row;
        })
    };
    return { SystemSetting, TenantLocation, settings, locations };
};

describe('approved company registration materialization', () => {
    it('writes canonical tenant settings and updates the same records on retry', async () => {
        const models = buildModels();
        const sequelize = { transaction: jest.fn(async (callback) => callback({ id: 'transaction-1' })) };
        const materialize = buildMaterializeApprovedCompanyRegistration({
            connector: { getConnection: jest.fn().mockResolvedValue(sequelize) },
            modelFactory: jest.fn().mockReturnValue(models),
            logger: { warn: jest.fn() }
        });
        const application = {
            id: 'application-1',
            current_attempt_no: 1,
            attempts: [{ submission_snapshot: {
                company_name: 'Approved Foods',
                business_type: 'restaurant',
                storefront_profile: {
                    description: 'Fresh meals',
                    phone: '+639000000000',
                    email: 'hello@approved.test',
                    facebook: 'https://facebook.test/approved'
                },
                delivery_partners: ['grab'],
                hours: [{ day: 'monday', open: '09:00', close: '18:00', closed: false }],
                location: { name: 'Main', address_line: '1 Main Street', latitude: 10.72, longitude: 122.56 }
            } }]
        };
        const tenant = { id: 'tenant-1', name: 'Approved Foods' };

        const first = await materialize({ tenant, application });
        const second = await materialize({ tenant, application });

        expect(first).toEqual(expect.objectContaining({ location_materialized: true, menu_catalog_published: false }));
        expect(second).toEqual(expect.objectContaining({ location_materialized: true, menu_catalog_published: false }));
        expect(models.SystemSetting.create).toHaveBeenCalledTimes(9);
        expect(models.TenantLocation.create).toHaveBeenCalledTimes(1);
        expect(models.TenantLocation.findOne).toHaveBeenCalledTimes(2);
        expect(models.settings.get('storefront_about').setting_value).toBe('Fresh meals');
        expect(models.settings.get('storefront_hours').setting_value).toContain('"mon"');
        expect(models.settings.get('company_registration_materialization').setting_value).toContain('application-1:1');
    });

    it('does not create a tenant catalog row for a menu upload', async () => {
        const models = buildModels();
        const sequelize = { transaction: jest.fn(async (callback) => callback({})) };
        const materialize = buildMaterializeApprovedCompanyRegistration({
            connector: { getConnection: jest.fn().mockResolvedValue(sequelize) },
            modelFactory: jest.fn().mockReturnValue(models),
            logger: { warn: jest.fn() }
        });

        const result = await materialize({
            tenant: { id: 'tenant-2', name: 'Menu Review Foods' },
            application: {
                id: 'application-2',
                current_attempt_no: 1,
                attempts: [{ submission_snapshot: { company_name: 'Menu Review Foods', hours: [] } }]
            }
        });

        expect(result.menu_catalog_published).toBe(false);
        expect(models).not.toHaveProperty('Item');
    });
});

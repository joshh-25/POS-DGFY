import { afterEach, describe, expect, it, jest } from '@jest/globals';

const userModel = { findAll: jest.fn() };
const staffRoleModel = {};
const tenantModels = { User: userModel, StaffRole: staffRoleModel };
const dbStore = {
    getStore: jest.fn(() => tenantModels),
    get: jest.fn((name) => tenantModels[name])
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: dbStore }));
const { staffPushAudienceRepository } = await import('../src/modules/pushDelivery/repositories/staffPushAudienceRepository.js');

afterEach(() => jest.clearAllMocks());

describe('staffPushAudienceRepository', () => {
    it('reads only active, non-deleted users from the current tenant and includes assigned permissions', async () => {
        userModel.findAll.mockResolvedValue([]);

        await staffPushAudienceRepository.listActiveStaffUsers();

        expect(dbStore.get).toHaveBeenNthCalledWith(1, 'User');
        expect(dbStore.get).toHaveBeenNthCalledWith(2, 'StaffRole');
        expect(userModel.findAll).toHaveBeenCalledWith({
            where: { is_active: true, deleted_at: null },
            attributes: ['user_id', 'is_active', 'deleted_at', 'is_master_admin', 'permissions', 'role'],
            include: [{
                model: staffRoleModel,
                as: 'staffRole',
                attributes: ['capabilities', 'is_active'],
                required: false
            }],
            order: [['user_id', 'ASC']]
        });
    });

    it('fails closed when no tenant database context is active', async () => {
        dbStore.getStore.mockReturnValueOnce(null);

        await expect(staffPushAudienceRepository.listActiveStaffUsers())
            .rejects.toThrow('Tenant context is required');
        expect(userModel.findAll).not.toHaveBeenCalled();
    });
});

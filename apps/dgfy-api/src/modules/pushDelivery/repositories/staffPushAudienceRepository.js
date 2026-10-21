import dbStore from '../../../utils/dbStore.js';

export const staffPushAudienceRepository = {
    async listActiveStaffUsers() {
        const tenantModels = dbStore.getStore();
        if (!tenantModels?.User) {
            throw new Error('Tenant context is required to resolve the staff push audience');
        }

        const User = dbStore.get('User');
        const StaffRole = dbStore.get('StaffRole');
        return User.findAll({
            where: { is_active: true, deleted_at: null },
            attributes: ['user_id', 'is_active', 'deleted_at', 'is_master_admin', 'permissions', 'role'],
            include: [{
                model: StaffRole,
                as: 'staffRole',
                attributes: ['capabilities', 'is_active'],
                required: false
            }],
            order: [['user_id', 'ASC']]
        });
    }
};

export default staffPushAudienceRepository;

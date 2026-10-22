/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const description = await queryInterface.describeTable('users');
        if (!description.permission_mode) {
            await queryInterface.addColumn('users', 'permission_mode', {
                type: Sequelize.STRING(16),
                allowNull: false,
                defaultValue: 'inherit'
            });
        }

        const [users] = await queryInterface.sequelize.query(
            'SELECT user_id, role, permissions FROM users'
        );
        const shiftPermissions = new Set([
            'pos:shift_access',
            'pos:shift_close',
            'pos:close_day',
            'pos:cash_drawer_adjust',
            'pos:shift_force_close',
            'pos:fiscal_terminals:manage',
            'pos:esales:manage',
            'pos:switch_location',
            'pos:employees:manage'
        ]);

        for (const user of users) {
            let permissions = user.permissions;
            if (typeof permissions === 'string') {
                try {
                    permissions = JSON.parse(permissions);
                } catch {
                    permissions = [];
                }
            }
            permissions = Array.isArray(permissions)
                ? Array.from(new Set(permissions.filter((permission) => typeof permission === 'string' && permission.trim())))
                : [];

            // Existing non-empty arrays are explicit grants. Empty legacy rows
            // remain inherited so role/staff-role defaults continue to work.
            const permissionMode = permissions.length > 0 ? 'custom' : 'inherit';
            const hasShiftGrant = permissions.some((permission) => shiftPermissions.has(permission));
            if (hasShiftGrant && !permissions.includes('pos:shift_access')) {
                permissions.push('pos:shift_access');
            }
            if (hasShiftGrant && !permissions.includes('pos:view')) {
                permissions.push('pos:view');
            }

            await queryInterface.sequelize.query(
                'UPDATE users SET permission_mode = :permissionMode, permissions = :permissions WHERE user_id = :userId',
                {
                    replacements: {
                        permissionMode,
                        permissions: JSON.stringify(permissions),
                        userId: user.user_id
                    }
                }
            );
        }
    },

    async down(queryInterface) {
        const description = await queryInterface.describeTable('users');
        if (description.permission_mode) {
            await queryInterface.removeColumn('users', 'permission_mode');
        }
    }
};

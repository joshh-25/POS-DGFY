/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('users');

        if (!tableInfo.invitation_token) {
            await queryInterface.addColumn('users', 'invitation_token', {
                type: Sequelize.STRING(64),
                allowNull: true,
                unique: true
            });
        }

        if (!tableInfo.invitation_expires_at) {
            await queryInterface.addColumn('users', 'invitation_expires_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.invited_by) {
            await queryInterface.addColumn('users', 'invited_by', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                }
            });
        }

        if (!tableInfo.invitation_status) {
            await queryInterface.addColumn('users', 'invitation_status', {
                type: Sequelize.ENUM('pending', 'accepted', 'expired'),
                allowNull: true
            });
        }

        if (!tableInfo.deleted_at) {
            await queryInterface.addColumn('users', 'deleted_at', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!tableInfo.deleted_by) {
            await queryInterface.addColumn('users', 'deleted_by', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                }
            });
        }
    },

    async down(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('users');

        if (tableInfo.invitation_token) await queryInterface.removeColumn('users', 'invitation_token');
        if (tableInfo.invitation_expires_at) await queryInterface.removeColumn('users', 'invitation_expires_at');
        if (tableInfo.invited_by) await queryInterface.removeColumn('users', 'invited_by');
        if (tableInfo.invitation_status) await queryInterface.removeColumn('users', 'invitation_status');
        if (tableInfo.deleted_at) await queryInterface.removeColumn('users', 'deleted_at');
        if (tableInfo.deleted_by) await queryInterface.removeColumn('users', 'deleted_by');
    }
};

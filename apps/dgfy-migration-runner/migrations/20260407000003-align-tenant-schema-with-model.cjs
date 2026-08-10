'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        if (!tableInfo.admin_email) {
            await queryInterface.addColumn('tenants', 'admin_email', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }

        if (!tableInfo.admin_password_hash) {
            await queryInterface.addColumn('tenants', 'admin_password_hash', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }

        // Normalize legacy plan values before narrowing to enum.
        if (tableInfo.plan) {
            await queryInterface.sequelize.query(`
                UPDATE tenants
                SET plan = 'standard'
                WHERE plan IS NULL OR plan NOT IN ('standard', 'premium')
            `);

            await queryInterface.changeColumn('tenants', 'plan', {
                type: Sequelize.ENUM('standard', 'premium'),
                allowNull: false,
                defaultValue: 'standard'
            });
        } else {
            await queryInterface.addColumn('tenants', 'plan', {
                type: Sequelize.ENUM('standard', 'premium'),
                allowNull: false,
                defaultValue: 'standard'
            });
        }

        // Bring status enum in line with model/runtime expectations.
        if (tableInfo.status) {
            await queryInterface.sequelize.query(`
                UPDATE tenants
                SET status = 'pending'
                WHERE status IS NULL
            `);

            await queryInterface.changeColumn('tenants', 'status', {
                type: Sequelize.ENUM('pending', 'active', 'inactive', 'rejected', 'archived'),
                allowNull: false,
                defaultValue: 'pending'
            });
        } else {
            await queryInterface.addColumn('tenants', 'status', {
                type: Sequelize.ENUM('pending', 'active', 'inactive', 'rejected', 'archived'),
                allowNull: false,
                defaultValue: 'pending'
            });
        }
    },

    async down(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenants').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        if (tableInfo.admin_password_hash) {
            await queryInterface.removeColumn('tenants', 'admin_password_hash');
        }

        if (tableInfo.admin_email) {
            await queryInterface.removeColumn('tenants', 'admin_email');
        }

        // Revert to the original bootstrap tenant schema.
        if (tableInfo.plan) {
            await queryInterface.changeColumn('tenants', 'plan', {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: 'free'
            });
        }

        if (tableInfo.status) {
            await queryInterface.changeColumn('tenants', 'status', {
                type: Sequelize.ENUM('active', 'inactive', 'archived'),
                allowNull: true,
                defaultValue: 'active'
            });
        }
    }
};

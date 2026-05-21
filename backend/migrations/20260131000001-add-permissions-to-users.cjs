
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Define constants locally to avoid ESM/CJS import issues during migration
        const PERMISSIONS = {
            INVENTORY: {
                actions: {
                    VIEW_ITEMS: "items:view",
                    CREATE_ITEMS: "items:create",
                    EDIT_ITEMS: "items:edit",
                    DELETE_ITEMS: "items:delete",
                    EXPORT_ITEMS: "items:export",
                    IMPORT_ITEMS: "items:import",
                }
            },
            SUPPLIERS: {
                actions: {
                    VIEW_SUPPLIERS: "suppliers:view",
                    CREATE_SUPPLIERS: "suppliers:create",
                    EDIT_SUPPLIERS: "suppliers:edit",
                    DELETE_SUPPLIERS: "suppliers:delete",
                    EXPORT_SUPPLIERS: "suppliers:export",
                    IMPORT_SUPPLIERS: "suppliers:import",
                }
            },
            ORDERS: {
                actions: {
                    VIEW_PO: "po:view",
                    CREATE_PO: "po:create",
                    EDIT_PO: "po:edit",
                    APPROVE_PO: "po:approve",
                    RECEIVE_PO: "po:receive",
                    DELETE_PO: "po:delete",
                    VIEW_JO: "jo:view",
                    CREATE_JO: "jo:create",
                    EDIT_JO: "jo:edit",
                    APPROVE_JO: "jo:approve",
                    COMPLETE_JO: "jo:complete",
                    DELETE_JO: "jo:delete",
                }
            },
            STOCK: {
                actions: {
                    VIEW_MOVEMENTS: "stock:view",
                    CREATE_ADJUSTMENT: "stock:adjust",
                    VIEW_BATCHES: "batches:view",
                    EDIT_BATCHES: "batches:edit",
                }
            },
            REPORTS: {
                actions: {
                    VIEW_REPORTS: "reports:view",
                    EXPORT_REPORTS: "reports:export",
                }
            },
            AI: {
                actions: {
                    AI_CHAT_VIEW: "ai:chat",
                    AI_CHAT_ACTION: "ai:action",
                }
            },
            SYSTEM: {
                actions: {
                    VIEW_SETTINGS: "settings:view",
                    EDIT_SETTINGS: "settings:edit",
                    MANAGE_USERS: "users:manage",
                    VIEW_AUDIT: "audit:view",
                }
            }
        };

        const getAllPermissions = () => {
            const all = [];
            Object.values(PERMISSIONS).forEach(group => {
                Object.values(group.actions).forEach(permission => {
                    all.push(permission);
                });
            });
            return all;
        };

        const DEFAULT_ROLE_PERMISSIONS = {
            admin: getAllPermissions(),
            manager: [
                ...Object.values(PERMISSIONS.INVENTORY.actions),
                ...Object.values(PERMISSIONS.SUPPLIERS.actions),
                ...Object.values(PERMISSIONS.ORDERS.actions),
                ...Object.values(PERMISSIONS.STOCK.actions),
                ...Object.values(PERMISSIONS.REPORTS.actions),
                PERMISSIONS.AI.actions.AI_CHAT_VIEW,
                PERMISSIONS.AI.actions.AI_CHAT_ACTION,
                PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
                PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS,
                PERMISSIONS.SYSTEM.actions.VIEW_AUDIT
            ],
            staff: [
                PERMISSIONS.INVENTORY.actions.VIEW_ITEMS,
                PERMISSIONS.SUPPLIERS.actions.VIEW_SUPPLIERS,
                PERMISSIONS.ORDERS.actions.VIEW_PO,
                PERMISSIONS.ORDERS.actions.VIEW_JO,
                PERMISSIONS.STOCK.actions.VIEW_MOVEMENTS,
                PERMISSIONS.AI.actions.AI_CHAT_VIEW,
            ]
        };

        // 1. Add permissions column
        await queryInterface.addColumn('users', 'permissions', {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: []
        });

        // 2. Add is_master_admin column
        await queryInterface.addColumn('users', 'is_master_admin', {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            allowNull: false
        });

        // 3. Migrate existing data
        const [users] = await queryInterface.sequelize.query("SELECT user_id, email, role FROM users");

        for (const user of users) {
            let perms = [];
            let isMaster = false;

            if (user.email === 'admin@test.com') {
                isMaster = true;
                perms = DEFAULT_ROLE_PERMISSIONS.admin;
            } else if (user.role === 'admin') {
                perms = DEFAULT_ROLE_PERMISSIONS.admin;
            } else if (user.role === 'manager') {
                perms = DEFAULT_ROLE_PERMISSIONS.manager;
            } else if (user.role === 'staff') {
                perms = DEFAULT_ROLE_PERMISSIONS.staff;
            } else {
                perms = [];
            }

            await queryInterface.sequelize.query(
                `UPDATE users SET permissions = :perms, is_master_admin = :isMaster WHERE user_id = :id`,
                {
                    replacements: {
                        perms: JSON.stringify(perms),
                        isMaster: isMaster,
                        id: user.user_id
                    }
                }
            );
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('users', 'is_master_admin');
        await queryInterface.removeColumn('users', 'permissions');
    }
};

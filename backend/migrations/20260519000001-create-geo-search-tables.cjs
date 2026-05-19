/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = await queryInterface.showAllTables();
        const existing = new Set(
            tables.map((t) => (typeof t === 'object' ? t.tableName || t.name : t))
        );

        // ── geo_items ────────────────────────────────────────────────────────
        // Canonical cross-tenant item catalog.
        // FULLTEXT on (name, normalized_name) powers the keyword search step.
        if (!existing.has('geo_items')) {
            await queryInterface.createTable('geo_items', {
                geo_item_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    primaryKey: true,
                    autoIncrement: true
                },
                name: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                normalized_name: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                category: {
                    type: Sequelize.STRING(100),
                    allowNull: true
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                }
            });

            await queryInterface.addIndex('geo_items', ['normalized_name'], {
                name: 'idx_geo_items_normalized_name'
            });

            // FULLTEXT index for MATCH ... AGAINST keyword search
            await queryInterface.sequelize.query(
                'ALTER TABLE geo_items ADD FULLTEXT INDEX ft_geo_items_name (name, normalized_name)'
            );
        }

        // ── geo_store_items ──────────────────────────────────────────────────
        // Cross-tenant store→item inventory.
        // One row per (tenant, location, item) triple; upserted by the ingestion worker.
        if (!existing.has('geo_store_items')) {
            await queryInterface.createTable('geo_store_items', {
                id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    primaryKey: true,
                    autoIncrement: true
                },
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                // Nullable: NULL means "all locations for this tenant"
                location_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: true
                },
                item_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: false
                },
                price: {
                    type: Sequelize.DECIMAL(12, 2),
                    allowNull: true
                },
                quantity: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 0
                },
                in_stock: {
                    type: Sequelize.TINYINT(1),
                    allowNull: false,
                    defaultValue: 1
                },
                last_updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                }
            });

            await queryInterface.addIndex(
                'geo_store_items',
                ['tenant_id', 'location_id', 'item_id'],
                { name: 'uk_geo_store_items_tenant_loc_item', unique: true }
            );
            await queryInterface.addIndex('geo_store_items', ['item_id'], {
                name: 'idx_geo_store_items_item_id'
            });
            await queryInterface.addIndex('geo_store_items', ['in_stock'], {
                name: 'idx_geo_store_items_in_stock'
            });
            await queryInterface.addIndex('geo_store_items', ['last_updated_at'], {
                name: 'idx_geo_store_items_last_updated'
            });
        }

        // ── geo_item_aliases ─────────────────────────────────────────────────
        // Alternate names / store-submitted variants mapped to canonical geo_items.
        // FULLTEXT on alias_name absorbs misspellings the main FULLTEXT index won't catch.
        // moderation_status guards the alias resolution path: only 'approved' aliases are
        // used for canonical resolution; 'pending' aliases await curator review.
        if (!existing.has('geo_item_aliases')) {
            await queryInterface.createTable('geo_item_aliases', {
                alias_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    primaryKey: true,
                    autoIncrement: true
                },
                item_id: {
                    type: Sequelize.BIGINT.UNSIGNED,
                    allowNull: false
                },
                alias_name: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                // NULL = global alias; non-NULL = submitted by a specific tenant
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: true
                },
                moderation_status: {
                    type: Sequelize.ENUM('approved', 'pending', 'rejected'),
                    allowNull: false,
                    defaultValue: 'pending'
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                }
            });

            await queryInterface.addIndex('geo_item_aliases', ['item_id'], {
                name: 'idx_geo_item_aliases_item_id'
            });
            await queryInterface.addIndex(
                'geo_item_aliases',
                ['alias_name', 'moderation_status'],
                { name: 'idx_geo_item_aliases_name_status' }
            );
            await queryInterface.sequelize.query(
                'ALTER TABLE geo_item_aliases ADD FULLTEXT INDEX ft_geo_item_aliases_name (alias_name)'
            );
        }
    },

    async down(queryInterface) {
        await queryInterface.dropTable('geo_item_aliases').catch(() => {});
        await queryInterface.dropTable('geo_store_items').catch(() => {});
        await queryInterface.dropTable('geo_items').catch(() => {});
        // Clean up ENUM type artefacts on non-MySQL dialects
        if (queryInterface.sequelize.getDialect() === 'mysql') {
            await queryInterface.sequelize
                .query("DROP TYPE IF EXISTS enum_geo_item_aliases_moderation_status")
                .catch(() => {});
        }
    }
};

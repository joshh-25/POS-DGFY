
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const applyMigration = async (dbName) => {
    console.log(`\n>>> Migrating Database: ${dbName}`);
    const sequelize = new Sequelize(dbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false
    });

    const queryInterface = sequelize.getQueryInterface();

    try {
        await sequelize.authenticate();

        // 1. Create item_folders table
        const [tables] = await sequelize.query("SHOW TABLES LIKE 'item_folders'");
        if (tables.length === 0) {
            console.log('Creating item_folders table...');
            await queryInterface.createTable('item_folders', {
                folder_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                name: {
                    type: Sequelize.STRING(100),
                    allowNull: false,
                    unique: true
                },
                description: {
                    type: Sequelize.TEXT,
                    allowNull: true
                },
                parent_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'item_folders',
                        key: 'folder_id'
                    },
                    onDelete: 'SET NULL'
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
            await queryInterface.addIndex('item_folders', ['name'], { name: 'idx_folder_name' });
            await queryInterface.addIndex('item_folders', ['parent_id'], { name: 'idx_folder_parent' });
            console.log('✅ Created item_folders table.');
        } else {
            console.log('✔ item_folders table already exists.');
        }

        // 2. Add folder_id to items table
        const [columns] = await sequelize.query(`SHOW COLUMNS FROM items LIKE 'folder_id'`);
        if (columns.length === 0) {
            console.log('Adding folder_id column to items table...');
            await queryInterface.addColumn('items', 'folder_id', {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'item_folders',
                    key: 'folder_id'
                },
                onDelete: 'SET NULL'
            });
            await queryInterface.addIndex('items', ['folder_id'], { name: 'idx_items_folder_id' });
            console.log('✅ Added folder_id column to items.');
        } else {
            console.log('✔ folder_id column already exists in items.');
        }

        // 3. Mark migration as done in sequelizemeta if it exists
        const [metaTable] = await sequelize.query("SHOW TABLES LIKE 'sequelizemeta'");
        if (metaTable.length > 0) {
            await sequelize.query("INSERT IGNORE INTO sequelizemeta (name) VALUES ('20260202000002-create-item-folders.js')");
            await sequelize.query("INSERT IGNORE INTO sequelizemeta (name) VALUES ('20260202000003-update-items-folder-relation.js')");
            console.log('✅ Updated sequelizemeta.');
        }

    } catch (error) {
        console.error(`❌ Error migrating ${dbName}:`, error.message);
    } finally {
        await sequelize.close();
    }
};

const runAll = async () => {
    // 1. Migrate Landlord DB (from .env)
    const landlordDb = process.env.DB_NAME || 'SKU';
    await applyMigration(landlordDb);

    // 2. Find and migrate all tenants
    console.log('\n--- Fetching Tenants ---');
    const landlord = new Sequelize(landlordDb, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false
    });

    try {
        const tenants = await landlord.query('SELECT name, db_name FROM tenants', { type: Sequelize.QueryTypes.SELECT });
        console.log(`Found ${tenants.length} tenants in ${landlordDb}.`);

        for (const tenant of tenants) {
            if (tenant.db_name && tenant.db_name !== landlordDb) {
                await applyMigration(tenant.db_name);
            }
        }
    } catch (error) {
        console.error('❌ Error fetching tenants:', error.message);
    } finally {
        await landlord.close();
    }

    console.log('\n--- All Migrations Finished ---');
};

runAll();

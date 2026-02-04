import { Sequelize, DataTypes } from 'sequelize';
import sequelize from '../src/config/database.js'; // Landlord DB
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration-like script to add nesting metadata columns to items table across all tenants
 */
async function syncNestingMetadata() {
    try {
        await sequelize.authenticate();
        console.log('✅ Landlord DB connected');

        // 1. Get all tenants
        const [tenants] = await sequelize.query("SELECT id, name, db_name FROM tenants WHERE status = 'active'");
        console.log(`🔍 Found ${tenants.length} active tenants`);

        for (const tenant of tenants) {
            console.log(`\n📦 Processing tenant: ${tenant.name} (${tenant.db_name})...`);

            const tenantSeq = new Sequelize(tenant.db_name, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
                host: process.env.DB_HOST || 'localhost',
                dialect: 'mysql',
                logging: false
            });

            try {
                // Add nesting_level
                await tenantSeq.query(`
                    ALTER TABLE items 
                    ADD COLUMN IF NOT EXISTS nesting_level INT DEFAULT 0 COMMENT '0=raw ingredient, 1-3=nested product levels'
                `).catch(e => console.log(`  - nesting_level: ${e.message}`));

                // Add max_child_depth
                await tenantSeq.query(`
                    ALTER TABLE items 
                    ADD COLUMN IF NOT EXISTS max_child_depth INT DEFAULT 0
                `).catch(e => console.log(`  - max_child_depth: ${e.message}`));

                // Add is_leaf_node
                await tenantSeq.query(`
                    ALTER TABLE items 
                    ADD COLUMN IF NOT EXISTS is_leaf_node BOOLEAN DEFAULT TRUE
                `).catch(e => console.log(`  - is_leaf_node: ${e.message}`));

                // Add composition_hash
                await tenantSeq.query(`
                    ALTER TABLE items 
                    ADD COLUMN IF NOT EXISTS composition_hash VARCHAR(64)
                `).catch(e => console.log(`  - composition_hash: ${e.message}`));

                console.log(`✅ Synced schema for ${tenant.name}`);
            } catch (err) {
                console.error(`❌ Failed to sync ${tenant.name}:`, err.message);
            } finally {
                await tenantSeq.close();
            }
        }

        console.log('\n🎉 Finished syncing all tenants!');
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await sequelize.close();
    }
}

syncNestingMetadata();

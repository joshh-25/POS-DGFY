/**
 * Backfill Script: Populate user_tenant_mappings table with existing users
 *
 * This script iterates through all active tenants, connects to each tenant database,
 * queries all active users, and creates email-tenant mappings in the landlord database.
 *
 * Run with: node backend/scripts/backfill-email-mappings.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Sequelize } from 'sequelize';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Import models after dotenv is loaded
const { Tenant, UserTenantMapping, sequelize } = await import('../src/models/index.js');

async function backfillEmailMappings() {
    console.log('='.repeat(60));
    console.log('Backfill Email-Tenant Mappings');
    console.log('='.repeat(60));

    try {
        // 1. Get all active tenants
        const tenants = await Tenant.findAll({
            where: { status: 'active' }
        });

        console.log(`\nFound ${tenants.length} active tenant(s)\n`);

        let totalMappingsCreated = 0;
        let totalUsersProcessed = 0;
        let errors = [];

        // 2. Process each tenant
        for (const tenant of tenants) {
            console.log(`-`.repeat(50));
            console.log(`Processing: ${tenant.name} (${tenant.db_name})`);

            try {
                // Create connection to tenant database
                const tenantSequelize = new Sequelize(
                    tenant.db_name,
                    process.env.DB_USER || 'root',
                    process.env.DB_PASSWORD || '',
                    {
                        host: tenant.db_host || process.env.DB_HOST || 'localhost',
                        dialect: 'mysql',
                        logging: false
                    }
                );

                // Query active users from tenant DB
                const [users] = await tenantSequelize.query(`
                    SELECT user_id, email, username, is_active
                    FROM users
                    WHERE is_active = 1
                `);

                console.log(`  Found ${users.length} active user(s)`);

                // Create mappings for each user
                for (const user of users) {
                    try {
                        const [mapping, created] = await UserTenantMapping.findOrCreate({
                            where: {
                                email: user.email.toLowerCase().trim(),
                                tenant_id: tenant.id
                            },
                            defaults: {
                                email: user.email.toLowerCase().trim(),
                                tenant_id: tenant.id
                            }
                        });

                        if (created) {
                            console.log(`    + Created mapping: ${user.email} -> ${tenant.name}`);
                            totalMappingsCreated++;
                        } else {
                            console.log(`    - Mapping exists: ${user.email}`);
                        }
                        totalUsersProcessed++;
                    } catch (userError) {
                        const errorMsg = `Failed to create mapping for ${user.email}: ${userError.message}`;
                        console.error(`    ! ${errorMsg}`);
                        errors.push(errorMsg);
                    }
                }

                // Close tenant connection
                await tenantSequelize.close();

            } catch (tenantError) {
                const errorMsg = `Failed to process tenant ${tenant.name}: ${tenantError.message}`;
                console.error(`  ! ${errorMsg}`);
                errors.push(errorMsg);
            }
        }

        // 3. Summary
        console.log('\n' + '='.repeat(60));
        console.log('Summary');
        console.log('='.repeat(60));
        console.log(`Tenants processed: ${tenants.length}`);
        console.log(`Users processed: ${totalUsersProcessed}`);
        console.log(`New mappings created: ${totalMappingsCreated}`);
        console.log(`Errors: ${errors.length}`);

        if (errors.length > 0) {
            console.log('\nErrors:');
            errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
        }

        console.log('\nBackfill complete!');

    } catch (error) {
        console.error('Fatal error during backfill:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

// Run the script
backfillEmailMappings();

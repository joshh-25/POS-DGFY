/**
 * Onboard Production Tenant Script
 * 
 * Registers the existing production database as the primary tenant and maps 
 * all current users to it in the Landlord (central) database.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'sku_inventory_manager';

async function onboard() {
    console.log('='.repeat(60));
    console.log('Onboarding Production Tenant');
    console.log('='.repeat(60));

    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME
    });

    try {
        // 1. Check if tables exist
        const [tables] = await connection.query("SHOW TABLES LIKE 'tenants'");
        if (tables.length === 0) {
            console.error('❌ Table "tenants" not found. Please run migrations first.');
            process.exit(1);
        }

        // 2. Check if a tenant already exists
        const [tenants] = await connection.query("SELECT id FROM tenants LIMIT 1");
        let tenantId;

        if (tenants.length > 0) {
            tenantId = tenants[0].id;
            console.log(`ℹ️  A tenant already exists (ID: ${tenantId}). Skipping creation.`);
        } else {
            // Create the first tenant
            console.log('📦 Creating primary tenant record...');
            const companyToken = crypto.randomBytes(16).toString('hex');
            const [result] = await connection.query(
                `INSERT INTO tenants (id, name, db_name, company_token, status, plan, created_at, updated_at) 
                 VALUES (UUID(), 'SureBiz Corp', ?, ?, 'active', 'enterprise', NOW(), NOW())`,
                [DB_NAME, companyToken]
            );

            // Get the ID of the tenant we just created
            const [newTenant] = await connection.query("SELECT id FROM tenants WHERE db_name = ?", [DB_NAME]);
            tenantId = newTenant[0].id;
            console.log(`✅ Created Tenant: SureBiz Corp (ID: ${tenantId})`);
            console.log(`🔑 Company Token: ${companyToken}`);
        }

        // 3. Map existing users to this tenant
        console.log('🔗 Mapping existing users to tenant...');
        const [users] = await connection.query("SELECT email FROM users WHERE is_active = 1");
        let count = 0;

        for (const user of users) {
            const email = user.email.toLowerCase().trim();
            // findOrCreate equivalent in raw SQL
            const [mappings] = await connection.query(
                "SELECT id FROM user_tenant_mappings WHERE email = ? AND tenant_id = ?",
                [email, tenantId]
            );

            if (mappings.length === 0) {
                await connection.query(
                    "INSERT INTO user_tenant_mappings (email, tenant_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
                    [email, tenantId]
                );
                console.log(`   + Mapped: ${email}`);
                count++;
            }
        }

        console.log(`✅ Successfully mapped ${count} users.`);
        console.log('\n🚀 Onboarding Complete! The 404 errors should now be resolved.');

    } catch (error) {
        console.error('❌ Onboarding failed:', error.message);
    } finally {
        await connection.end();
    }
}

onboard();

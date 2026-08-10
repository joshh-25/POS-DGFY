import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const LANDLORD_DB = process.env.DB_NAME || 'sku_inventory_manager';

const TENANT_A = {
    name: 'Test Tenant A',
    uuid: uuidv4(),
    company_token: 'token-tenant-a',
    db_name: 'sku_test_tenant_a',
    domain: 'tenant-a.localhost',
    admin_email: 'admin@tenant-a.com'
};

const TENANT_B = {
    name: 'Test Tenant B',
    uuid: uuidv4(),
    company_token: 'token-tenant-b',
    db_name: 'sku_test_tenant_b',
    domain: 'tenant-b.localhost',
    admin_email: 'admin@tenant-b.com'
};

async function setup() {
    let connection;
    try {
        console.log('Connecting to MySQL...');
        connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            multipleStatements: true
        });

        console.log(`Creating databases: ${TENANT_A.db_name}, ${TENANT_B.db_name}`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${TENANT_A.db_name}\`;`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${TENANT_B.db_name}\`;`);

        // Register in Landlord DB
        console.log(`Registering tenants in ${LANDLORD_DB}...`);
        await connection.query(`USE \`${LANDLORD_DB}\`;`);

        // Insert Tenant A
        await connection.query(
            `INSERT INTO Tenants (id, name, db_name, domain, company_token, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
             ON DUPLICATE KEY UPDATE domain=VALUES(domain), company_token=VALUES(company_token)`,
            [TENANT_A.uuid, TENANT_A.name, TENANT_A.db_name, TENANT_A.domain, TENANT_A.company_token]
        );

        // Insert Tenant B
        await connection.query(
            `INSERT INTO Tenants (id, name, db_name, domain, company_token, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
             ON DUPLICATE KEY UPDATE domain=VALUES(domain), company_token=VALUES(company_token)`,
            [TENANT_B.uuid, TENANT_B.name, TENANT_B.db_name, TENANT_B.domain, TENANT_B.company_token]
        );

        // CREATE USERS
        const passwordHash = await bcrypt.hash('Admin123!', 10);

        console.log(`Creating Admin in ${TENANT_A.db_name}...`);
        await connection.query(`USE \`${TENANT_A.db_name}\`;`);
        // Grant is_master_admin = 1 to bypass permissions
        await connection.query(
            `INSERT INTO users (username, email, password_hash, role, is_active, is_master_admin, created_at, updated_at)
             VALUES ('Admin A', ?, ?, 'admin', 1, 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE is_master_admin=1`,
            [TENANT_A.admin_email, passwordHash]
        );

        console.log(`Creating Admin in ${TENANT_B.db_name}...`);
        await connection.query(`USE \`${TENANT_B.db_name}\`;`);
        await connection.query(
            `INSERT INTO users (username, email, password_hash, role, is_active, is_master_admin, created_at, updated_at)
             VALUES ('Admin B', ?, ?, 'admin', 1, 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE is_master_admin=1`,
            [TENANT_B.admin_email, passwordHash]
        );

        console.log('Tenants registered successfully.');
        console.log(`Tenant A ID: ${TENANT_A.uuid}`);
        console.log(`Tenant B ID: ${TENANT_B.uuid}`);

        return { tenantA: TENANT_A, tenantB: TENANT_B };

    } catch (error) {
        console.error('Setup failed:', error);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

setup();

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const TENANT_DB = 'sku_test_tenant_a'; // Hardcoded for debugging
const EMAIL = 'admin@tenant-a.com';
const PASSWORD = 'Admin123!';

async function debugLogin() {
    let connection;
    try {
        console.log(`Connecting to ${TENANT_DB}...`);
        connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: TENANT_DB
        });

        // 1. Fetch User (raw SQL to avoid Sequelize issues)
        const [rows] = await connection.query(
            'SELECT * FROM users WHERE email = ?',
            [EMAIL]
        );

        if (rows.length === 0) {
            console.error('❌ User lookup failed: User NOT found in DB.');
            return;
        }

        const user = rows[0];
        console.log('✓ User found:', {
            id: user.user_id,
            email: user.email,
            username: user.username,
            role: user.role,
            password_hash_len: user.password_hash?.length
        });

        // 2. Check Password
        console.log('Verifying password...');
        const match = await bcrypt.compare(PASSWORD, user.password_hash);

        if (match) {
            console.log('✓ Password match: SUCCESS');
        } else {
            console.error('❌ Password match: FAILED');
        }

    } catch (error) {
        console.error('Debug script error:', error);
    } finally {
        if (connection) await connection.end();
    }
}

debugLogin();

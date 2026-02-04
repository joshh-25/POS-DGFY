
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const inspectVonVVData = async () => {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'sku_tenant_vonvv_24796542'
        });

        console.log('Connected to sku_tenant_vonvv_24796542');

        // Check tenants table settings
        console.log('\n--- Tenants Table Data ---');
        const [tenants] = await connection.query('SELECT * FROM tenants');
        tenants.forEach(t => {
            console.log(`Tenant Name: ${t.name}`);
            console.log(`Settings: ${t.settings}`); // It's a stringified JSON usually
            try {
                const parsed = JSON.parse(t.settings);
                console.log('Parsed Settings:', JSON.stringify(parsed, null, 2));
            } catch (e) {
                console.log('(Settings not valid JSON)');
            }
        });

        // Check System Settings for any address-like keys again (double check)
        console.log('\n--- System Settings Data ---');
        const [settings] = await connection.query('SELECT * FROM system_settings');
        settings.forEach(s => {
            console.log(`${s.setting_key}: ${s.setting_value}`);
        });

    } catch (err) {
        console.error('Fatal Error:', err);
    }
};

inspectVonVVData();

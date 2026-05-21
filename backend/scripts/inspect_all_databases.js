
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const inspectAll = async () => {
    let output = '';
    const log = (msg) => {
        console.log(msg); // Keep console for progress
        if (typeof msg === 'object') msg = JSON.stringify(msg, null, 2);
        output += msg + '\n';
    };

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
        });

        log('Connected to MySQL server.');

        // Get all databases
        const [dbs] = await connection.query('SHOW DATABASES');
        const dbNames = dbs.map(d => d.Database).filter(name =>
            !['information_schema', 'mysql', 'performance_schema', 'phpmyadmin', 'test'].includes(name)
        );

        log('Found databases: ' + JSON.stringify(dbNames));

        for (const dbName of dbNames) {
            log(`\n=== Inspecting Database: ${dbName} ===`);
            try {
                // Get tables
                const [tables] = await connection.query(`SHOW TABLES FROM \`${dbName}\``);
                const tableNames = tables.map(t => Object.values(t)[0]);

                if (tableNames.includes('system_settings')) {
                    log('Found system_settings table. Checking for address/location configs...');
                    const [settings] = await connection.query(`SELECT * FROM \`${dbName}\`.\`system_settings\` WHERE setting_key LIKE '%address%' OR setting_key LIKE '%location%' OR setting_key LIKE '%company%'`);
                    if (settings.length > 0) {
                        log('Found settings:');
                        log(settings);
                    } else {
                        log('No specific address/company settings found.');
                    }
                }

                if (tableNames.includes('suppliers')) {
                    log('Found suppliers table. Checking for addresses...');
                    const [suppliers] = await connection.query(`SELECT supplier_id, name, address FROM \`${dbName}\`.\`suppliers\` LIMIT 5`);
                    if (suppliers.length > 0) {
                        log('Found suppliers with addresses:');
                        log(suppliers);
                    } else {
                        log('Suppliers table is empty.');
                    }
                }

                if (tableNames.includes('tenants')) {
                    log('Found tenants table (Landlord DB or similar).');
                }

            } catch (err) {
                log(`Error inspecting ${dbName}: ${err.message}`);
            }
        }

        await connection.end();
        fs.writeFileSync('all_dbs_dump.txt', output);
        console.log('Done. Written to all_dbs_dump.txt');

    } catch (err) {
        console.error('Fatal Error:', err);
    }
};

inspectAll();

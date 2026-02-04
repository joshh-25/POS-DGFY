
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const inspectSchema = async () => {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    const targetDB = 'sku_tenant_vonvv_24796542';

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: targetDB
        });

        log(`Connected to ${targetDB}. Fetching schema...`);

        const [tables] = await connection.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);

        log(`Found Tables: ${tableNames.join(', ')}`);

        for (const tableName of tableNames) {
            log(`\n--- Table: ${tableName} ---`);
            const [columns] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
            columns.forEach(col => {
                log(`${col.Field} (${col.Type})`);
            });

            // Peek at data if it looks promising
            if (['users', 'profiles', 'locations', 'addresses', 'companies', 'settings'].some(s => tableName.includes(s))) {
                log(`... Peeking at data for ${tableName} ...`);
                const [rows] = await connection.query(`SELECT * FROM \`${tableName}\` LIMIT 3`);
                log(JSON.stringify(rows, null, 2));
            }
        }

        await connection.end();
        fs.writeFileSync('vonvv_schema_dump.txt', output);
        console.log('Schema dump written to vonvv_schema_dump.txt');

    } catch (err) {
        console.error('Fatal Error:', err);
    }
};

inspectSchema();

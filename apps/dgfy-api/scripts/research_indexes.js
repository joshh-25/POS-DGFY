import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

async function research() {
    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        console.log(`--- Index Research on ${MAIN_DB} ---`);
        
        await connection.query(`USE \`${MAIN_DB}\``);
        const [tables] = await connection.query("SHOW TABLES");
        
        for (const row of tables) {
            const tableName = Object.values(row)[0];
            const [indexes] = await connection.query(`SHOW INDEX FROM \`${tableName}\``);
            
            const indexCount = new Set(indexes.map(i => i.Key_name)).size;
            if (indexCount > 30) {
                console.log(`⚠️ Table: ${tableName} - Index Count: ${indexCount}`);
                // Print those index names
                const indexNames = Array.from(new Set(indexes.map(i => i.Key_name)));
                console.log(`   Indexes: ${indexNames.join(', ')}`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

research();

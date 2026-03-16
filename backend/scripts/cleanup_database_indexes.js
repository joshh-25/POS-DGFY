import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

async function cleanup() {
    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        console.log(`--- Starting Index Cleanup on ${MAIN_DB} ---`);
        
        await connection.query(`USE \`${MAIN_DB}\``);
        const [tables] = await connection.query("SHOW TABLES");
        
        for (const row of tables) {
            const tableName = Object.values(row)[0];
            const [indexes] = await connection.query(`SHOW INDEX FROM \`${tableName}\``);
            
            // Group indexes by their base name (e.g. users_email_1 -> users_email)
            const indexGroups = {};
            
            for (const idx of indexes) {
                const keyName = idx.Key_name;
                if (keyName === 'PRIMARY') continue;
                
                // Identify suspected duplicate names like "name_1", "name_2", "name_etc"
                // or Sequelize style "table_column_1"
                const match = keyName.match(/^(.*?)_(\d+)$/);
                const baseName = match ? match[1] : keyName;
                
                if (!indexGroups[baseName]) indexGroups[baseName] = [];
                indexGroups[baseName].push(keyName);
            }

            for (const baseName in indexGroups) {
                const duplicates = indexGroups[baseName];
                if (duplicates.length > 1) {
                    console.log(`⚠️ Table ${tableName}: Found ${duplicates.length} variants of ${baseName}`);
                    
                    // Keep the one with no suffix if it exists, otherwise keep the first one
                    const original = duplicates.find(d => d === baseName) || duplicates[0];
                    const toDrop = duplicates.filter(d => d !== original);
                    
                    for (const dropName of toDrop) {
                        console.log(`   ⛔ Dropping redundant index: ${dropName}`);
                        try {
                            await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${dropName}\``);
                        } catch (e) {
                            console.error(`      ❌ Failed to drop ${dropName}: ${e.message}`);
                        }
                    }
                }
            }
        }
        
        console.log('\n✨ cleanup complete.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

cleanup();

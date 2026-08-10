
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';

async function run() {
    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    let output = '';
    const log = (msg) => { output += msg + '\n'; console.log(msg); };

    try {
        // 1. Get tenants
        await connection.query(`USE ${MAIN_DB}`);
        const [tenants] = await connection.query(`SELECT db_name FROM Tenants`);
        const databases = [MAIN_DB, ...tenants.map(t => t.db_name)];

        for (const dbName of databases) {
            // Check JO 34 in each DB
            try {
                await connection.query(`USE ${dbName}`);
                const [jos] = await connection.query(`SELECT * FROM job_orders WHERE jo_id = 34`);

                if (jos.length > 0) {
                    const jo = jos[0];
                    log(`\nFOUND JO #34 in DB: ${dbName}`);
                    log(`JO: ${jo.jo_number}, Status: ${jo.status}`);
                    log(`Qty to Produce: ${jo.quantity_to_produce}, Produced: ${jo.quantity_produced}`);

                    const [ingredients] = await connection.query(`SELECT * FROM jo_ingredients WHERE jo_id = ?`, [jo.jo_id]);
                    log(`Ingredients (${ingredients.length}):`);

                    for (const ing of ingredients) {
                        const [items] = await connection.query(`SELECT name, current_stock, unit_of_measure FROM Items WHERE item_id = ?`, [ing.item_id]);
                        const item = items[0];
                        log(`  - Item ${ing.item_id} (${item.name}):`);
                        log(`    Req: ${ing.quantity_required} ${ing.unit_of_measure} (Recipe UOM)`);
                        log(`    Stock: ${item.current_stock} ${item.unit_of_measure} (Stock UOM)`);
                    }
                }
            } catch (e) {
                log(`Error in ${dbName}: ${e.message}`);
            }
        }

    } catch (err) {
        log(err.message);
    } finally {
        fs.writeFileSync('latest_jo_dump.txt', output);
        await connection.end();
    }
}

run();

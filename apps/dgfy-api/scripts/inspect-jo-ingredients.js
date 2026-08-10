
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
// User is likely using a tenant DB, but let's check standard first or try to find the tenant
// The screenshot showed JO-2026-668062

async function run() {
    const connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        // 1. Find which tenant DB has this JO
        const [tenants] = await connection.query(`SELECT db_name FROM sku_inventory_manager.Tenants`);
        const allDbs = ['sku_inventory_manager', ...tenants.map(t => t.db_name)];

        for (const dbName of allDbs) {
            try {
                await connection.query(`USE ${dbName}`);
                const [jos] = await connection.query(`SELECT * FROM job_orders WHERE jo_number = 'JO-2026-668062'`);

                if (jos.length > 0) {
                    console.log(`\nFOUND JO IN DB: ${dbName}`);
                    const jo = jos[0];
                    console.log('JO Details:', jo);

                    // Check product composition
                    const [compositions] = await connection.query(`SELECT * FROM product_compositions WHERE product_id = ?`, [jo.product_id]);
                    console.log(`Product ID ${jo.product_id} has ${compositions.length} composition ingredients.`);
                    compositions.forEach(c => console.log(` - Ing ID: ${c.ingredient_id} Qty: ${c.quantity} ${c.unit_of_measure}`));

                    // Check ingredients
                    const [ingredients] = await connection.query(`SELECT * FROM jo_ingredients WHERE jo_id = ?`, [jo.jo_id]);
                    console.log('Ingredients Found:', ingredients.length);
                    console.log(ingredients);
                    break;
                }
            } catch (e) {
                // ignore
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

run();

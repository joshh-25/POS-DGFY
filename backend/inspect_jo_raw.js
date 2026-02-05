
import { Sequelize } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false
});

async function inspect() {
    try {
        const joNumber = 'JO-2026-380961';
        console.log(`Inspecting JO: ${joNumber}`);

        // 1. Get JO Details (Product ID, Qty)
        const [joResults] = await sequelize.query(`
      SELECT jo_id, jo_number, product_id, quantity_to_produce 
      FROM job_orders 
      WHERE jo_number = '${joNumber}'
    `);

        if (joResults.length === 0) {
            console.log('JO not found');
            return;
        }

        const jo = joResults[0];
        console.log('JO Details:', JSON.stringify(jo, null, 2));

        // 2. Get Product Item Details
        const [productResults] = await sequelize.query(`
      SELECT item_id, name, unit_of_measure 
      FROM items 
      WHERE item_id = ${jo.product_id}
    `);
        const product = productResults[0];
        console.log('Product Details:', JSON.stringify(product, null, 2));

        // 3. Get Composition
        const [compResults] = await sequelize.query(`
      SELECT pc.ingredient_id, pc.quantity_amount, i.name, i.unit_of_measure 
      FROM product_compositions pc
      JOIN items i ON pc.ingredient_id = i.item_id
      WHERE pc.parent_item_id = ${jo.product_id}
    `);

        console.log('Composition (Ingredients):');
        compResults.forEach(row => {
            const requiredTotal = row.quantity_amount * jo.quantity_to_produce;
            console.log(`- ${row.name} (ID: ${row.ingredient_id})`);
            console.log(`  Unit: ${row.unit_of_measure}`);
            console.log(`  Qty per 1 parent unit: ${row.quantity_amount}`);
            console.log(`  Total Required for JO: ${requiredTotal} ${row.unit_of_measure}`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

inspect();

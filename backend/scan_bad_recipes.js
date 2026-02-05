
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

async function scan() {
    try {
        console.log('Scanning for potentially corrupted recipes...');

        // Logic: Look for recipes where quantity_required is >= 1
        // This isn't always wrong (e.g. 1 unit needs 2 sub-units), but for kg/g conversions or large batches, 
        // it's often a sign of the "Batch Size Multiplier" bug.
        // Especially if the parent item has a batch size > 1.

        // Note: We need to join with Items to get batch_size (if stored in wizard_metadata or similar, though batch_size isn't a direct column on items usually, wait, checked describe_items.js, it's not there).
        // The wizard stores batch_size in wizard_metadata JSON. A raw SQL query is best here.

        // Let's just look for quantity_required > 10 for now as a heuristic for "1000x" errors.

        const [results] = await sequelize.query(`
      SELECT 
        pc.product_id, 
        p.name as product_name, 
        pc.ingredient_id, 
        i.name as ingredient_name, 
        pc.quantity_required,
        pc.unit_of_measure
      FROM product_composition pc
      JOIN items p ON pc.product_id = p.item_id
      JOIN items i ON pc.ingredient_id = i.item_id
      WHERE pc.quantity_required >= 10
    `);

        if (results.length === 0) {
            console.log('No obviously suspicious recipes found (Quantity >= 10).');
        } else {
            console.log(`Found ${results.length} potentially suspicious composition records:`);
            results.forEach(r => {
                console.log(`- Product: ${r.product_name} (ID: ${r.product_id}) requires ${r.quantity_required} ${r.unit_of_measure} of ${r.ingredient_name}`);
            });
        }

    } catch (error) {
        console.error(error);
    } finally {
        await sequelize.close();
    }
}

scan();

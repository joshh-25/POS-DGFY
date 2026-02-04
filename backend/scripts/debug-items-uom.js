
import dbStore from '../src/utils/dbStore.js';
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve('c:/xampp/htdocs/SKU-Inventory-Manager/backend/.env') });

const run = async () => {
    // Initialize DB connection (mocking what server.js does essentially)
    // We need to connect to the tenant DB actually.
    // The previous logs showed "Test Tenant A". I should check which tenant the admin user belongs to.
    // Admin was admin@test.com. I'll search for this user first or just check the items in the default/tenant DB.

    // NOTE: dbStore logic might depend on request context for multi-tenancy.
    // I will try to connect to the main DB first to find the tenant, then the tenant DB.

    // For simplicity, I'll assumme I can access the models if I initialize the store.
    // However, the app uses dynamic schema loading per tenant.

    // Let's try to just use the raw Sequelize instance if possible or mock the context.

    console.log("Setting up DB...");
    // We'll mimic a simplified direct connection to the tenant DB if we can find the credentials.
    // Or we can use the existing service methods if we can mock the request context.

    // Let's just look at the `items` table in the tenant database directly using raw SQL if possible, 
    // or use the models if we can bootstrap them.

    // Bootstrap:
    // 1. Connect to main DB.
    // 2. Find tenant for 'admin@test.com' (or just use 'token-test' as seen in logs).
    // 3. Connect to tenant DB.
    // 4. Query Items.

    // Actually, looking at the logs:
    // "Connecting to tenant: Test Tenant A (sku_test_tenant_a)"
    // So the DB name is `sku_test_tenant_a`.

    const sequelize = new Sequelize('sku_test_tenant_a', process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: () => { }
    });

    try {
        await sequelize.authenticate();
        console.log('Connected to sku_test_tenant_a.');

        const [items] = await sequelize.query(`
            SELECT i.name, i.unit_of_measure, i.current_stock 
            FROM items i 
            WHERE i.name = 'Explicit Selection Product'
        `);

        if (items.length === 0) {
            console.log("Product 'Explicit Selection Product' not found.");
        } else {
            console.log("Product Found: " + items[0].name + " | UOM: " + items[0].unit_of_measure);

            // Find ingredients via ProductComposition (assuming table name product_compositions or similar)
            // Need to check table name. Likely `product_compositions`

            const [ingredients] = await sequelize.query(`
                SELECT i.name, i.unit_of_measure as stock_uom, pc.quantity_required, pc.unit_of_measure as recipe_uom
                FROM product_compositions pc
                JOIN items i ON pc.ingredient_id = i.item_id
                WHERE pc.product_id = (SELECT item_id FROM items WHERE name = 'Explicit Selection Product')
            `);

            if (ingredients.length > 0) {
                console.log("Ingredients:");
                ingredients.forEach(ing => {
                    console.log(` - ${ing.name}: Stock UOM=[${ing.stock_uom}], Recipe UOM=[${ing.recipe_uom}], Qty=[${ing.quantity_required}]`);
                });
            } else {
                console.log("No ingredients found.");
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
};

run();

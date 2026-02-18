import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const sequelize = new Sequelize(
    // Override DB Name to match the tenant with token 'token-original'
    'sku_inventory_manager',
    process.env.DB_USER,
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST,
        dialect: process.env.DB_DIALECT,
        logging: false
    }
);

// Define Models (Minimal)
const Item = sequelize.define('Item', {
    item_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.ENUM('raw_material', 'packaging', 'product', 'supplies'), allowNull: false },
    product_type: { type: DataTypes.ENUM('work_in_progress', 'finished_goods'), allowNull: true },
    current_stock: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    unit_of_measure: { type: DataTypes.STRING },
    batch_size: { type: DataTypes.DECIMAL(12, 2) },
    status: { type: DataTypes.ENUM('draft', 'active', 'inactive'), defaultValue: 'active' }
}, { tableName: 'items', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const ProductComposition = sequelize.define('ProductComposition', {
    composition_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    ingredient_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity_required: { type: DataTypes.DECIMAL(24, 12), allowNull: false }, // High precision needed for Bug 1
    composition_type: { type: DataTypes.ENUM('ingredient', 'packaging'), defaultValue: 'ingredient' }
}, { tableName: 'product_composition', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const JobOrder = sequelize.define('JobOrder', {
    jo_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    jo_number: { type: DataTypes.STRING },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity_to_produce: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    quantity_produced: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    status: { type: DataTypes.ENUM('draft', 'in_progress', 'partial', 'completed', 'cancelled'), defaultValue: 'draft' },
    created_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'job_orders', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const JOIngredient = sequelize.define('JOIngredient', {
    jo_ingredient_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    jo_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity_required: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    unit_of_measure: { type: DataTypes.STRING },
    quantity_consumed: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 }
}, {
    tableName: 'jo_ingredients',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});


async function seed() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Create Raw Material (Ingredient)
        const ingredientName = 'QA Sugar Test';
        let ingredient = await Item.findOne({ where: { name: ingredientName } });
        if (!ingredient) {
            ingredient = await Item.create({
                name: ingredientName,
                category: 'raw_material',
                current_stock: 100000, // Plenty of stock
                unit_of_measure: 'g',
                status: 'active'
            });
            console.log(`Created Ingredient: ${ingredient.name} (ID: ${ingredient.item_id})`);
        } else {
            console.log(`Using existing Ingredient: ${ingredient.name} (ID: ${ingredient.item_id})`);
            // Reset stock just in case it was used
            await ingredient.update({ current_stock: 100000 });
        }

        // 2. Create Product (Test 1 & 2 target)
        const productName = 'QA Test Product 2026-02-18';
        let product = await Item.findOne({ where: { name: productName } });
        if (product) {
            await product.destroy(); // Re-create to ensure fresh state
            console.log('Destroyed old QA Product');
        }

        product = await Item.create({
            name: productName,
            category: 'product',
            product_type: 'finished_goods',
            current_stock: 0,
            unit_of_measure: 'g',
            batch_size: 300,
            status: 'active'
        });
        console.log(`Created Product: ${product.name} (ID: ${product.item_id})`);

        // 3. Add Recipe (Bug 1 Verification: Quantity = 1)
        await ProductComposition.create({
            product_id: product.item_id,
            ingredient_id: ingredient.item_id,
            quantity_required: 1.000000000000, // Exactly 1
            composition_type: 'ingredient'
        });
        console.log(`Added Recipe: 1g of ${ingredient.name} per batch`);

        // 4. Create Job Order (Bug 2 Verification)
        const joNumber = 'JO-QA-2026-001';
        let jo = await JobOrder.findOne({ where: { jo_number: joNumber } });
        if (jo) {
            await jo.destroy();
            console.log(`Destroyed old Job Order: ${joNumber}`);
        }

        jo = await JobOrder.create({
            jo_number: joNumber,
            product_id: product.item_id,
            quantity_to_produce: 24000,
            quantity_produced: 0,
            status: 'in_progress'
        });
        console.log(`Created Job Order: ${jo.jo_number} (ID: ${jo.jo_id}, Target: 24000g)`);

        // 5. Link Ingredients to Job Order
        const joIng = await JOIngredient.create({
            jo_id: jo.jo_id,
            item_id: ingredient.item_id,
            quantity_required: 24000,
            unit_of_measure: 'g',
            quantity_consumed: 0
        });
        console.log(`Linked Ingredient ID ${ingredient.item_id} to JO ID ${jo.jo_id} (JOIng ID: ${joIng.jo_ingredient_id})`);

        console.log('Seeding Complete. Ready for FINISHING QA Testing.');

    } catch (error) {
        console.error('Seeding Error:', error);
    } finally {
        await sequelize.close();
    }
}

seed();

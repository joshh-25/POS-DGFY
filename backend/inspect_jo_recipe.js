import { Sequelize, DataTypes } from 'sequelize';
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

const Item = sequelize.define('Item', {
    item_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: DataTypes.STRING,
    sku_code: DataTypes.STRING,
    unit_of_measure: DataTypes.STRING,
    type: DataTypes.STRING
}, { tableName: 'items', timestamps: false });

const ProductComposition = sequelize.define('ProductComposition', {
    composition_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    parent_item_id: DataTypes.INTEGER,
    ingredient_id: DataTypes.INTEGER,
    quantity_amount: DataTypes.DECIMAL(10, 2),
    composition_type: DataTypes.STRING
}, { tableName: 'product_compositions', timestamps: false });

const JobOrder = sequelize.define('JobOrder', {
    jo_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    jo_number: DataTypes.STRING,
    product_id: DataTypes.INTEGER,
    quantity_to_produce: DataTypes.DECIMAL(10, 2),
    status: DataTypes.STRING
}, { tableName: 'job_orders', timestamps: false });

// Relationships
Item.hasMany(ProductComposition, { foreignKey: 'parent_item_id' });
ProductComposition.belongsTo(Item, { as: 'ingredient', foreignKey: 'ingredient_id' });
JobOrder.belongsTo(Item, { foreignKey: 'product_id', as: 'Product' });

async function check() {
    try {
        const joNumber = 'JO-2026-380961';
        console.log(`Searching for Job Order: ${joNumber}`);

        const jo = await JobOrder.findOne({
            where: { jo_number: joNumber },
            include: [{ model: Item, as: 'Product' }]
        });

        if (!jo) {
            console.log('JO not found!');
            return;
        }

        console.log(`\nJob Order Found:`);
        console.log(`ID: ${jo.jo_id}`);
        console.log(`Number: ${jo.jo_number}`);
        console.log(`Status: ${jo.status}`);
        console.log(`Product: ${jo.Product.name} (ID: ${jo.product_id})`);
        console.log(`Product Unit: ${jo.Product.unit_of_measure}`);
        console.log(`Quantity to Produce: ${jo.quantity_to_produce}`);

        console.log(`\nFetching Recipe (Composition) for Product ID ${jo.product_id}...`);

        const compositions = await ProductComposition.findAll({
            where: { parent_item_id: jo.product_id },
            include: [{ model: Item, as: 'ingredient' }]
        });

        if (compositions.length === 0) {
            console.log('No recipe found for this product!');
        } else {
            console.log('Recipe:');
            compositions.forEach(comp => {
                const ingredient = comp.ingredient;
                const quantity = comp.quantity_amount;
                const totalRequired = quantity * jo.quantity_to_produce;

                console.log(`- Ingredient: ${ingredient.name} (ID: ${ingredient.item_id})`);
                console.log(`  Target Unit: ${ingredient.unit_of_measure}`);
                console.log(`  Qty per 1 parent unit: ${quantity}`);
                console.log(`  Total for JO (${jo.quantity_to_produce} parent units): ${totalRequired.toFixed(2)} ${ingredient.unit_of_measure}`);
            });
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

check();

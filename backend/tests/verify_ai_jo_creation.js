
import { execute } from '../src/services/aiToolExecutor.js';
import { createItem, getItemById } from '../src/services/itemService.js';
import { createStockMovement } from '../src/services/stockMovementService.js';
import db, { sequelize, User, Item, Supplier, FIFOBatch, ProductComposition } from '../src/models/index.js';

async function verifyAiJoCreation() {
    console.log('--- Starting AI JO Creation Verification ---');
    const transaction = await sequelize.transaction();

    try {
        // 1. Setup Data
        console.log('1. Setting up Test Data...');

        // Create User Mock
        const user = { user_id: 1, username: 'test_admin' }; // Assuming user 1 exists or is system

        // Create Ingredient
        const ing1 = await Item.create({
            sku_code: 'AI-ING-' + Date.now(),
            name: 'AI Test Ingredient',
            category: 'ingredient',
            unit_of_measure: 'kg',
            current_stock: 0,
            fifo_enabled: true,
            cost_per_unit: 10.00
        }, { transaction });

        // Add Stock for Ingredient
        await createStockMovement({
            item_id: ing1.item_id,
            quantity: 100,
            movement_type: 'purchase_receipt',
            reference_type: 'MANUAL',
            cost_per_unit: 10.00,
            po_number: 'AI-TEST-BATCH'
        }, user.user_id, transaction);

        // Create Product
        const product = await Item.create({
            sku_code: 'AI-PROD-' + Date.now(),
            name: 'AI Test Product',
            category: 'product',
            product_type: 'retail',
            unit_of_measure: 'units',
            current_stock: 0,
            fifo_enabled: true,

        }, { transaction });

        // Add Recipe (ProductComposition)
        await ProductComposition.create({
            product_id: product.item_id,
            ingredient_id: ing1.item_id,
            quantity_required: 2, // 2kg per unit
            composition_type: 'ingredient',
            unit_of_measure: 'kg'
        }, { transaction });

        await transaction.commit();

        console.log(`   Created Product ID: ${product.item_id} with Ingredient ID: ${ing1.item_id}`);

        // 2. Execute AI Tool: create_job_order
        // Note: We DO NOT pass ingredients, simulating the AI's behavior
        console.log('2. Executing create_job_order tool...');

        const result = await execute('create_job_order', {
            product_id: product.item_id,
            quantity: 5, // Should require 10kg of ingredient
            notes: 'AI Verification Test'
        }, user);

        console.log('   Tool Execution Result:', JSON.stringify(result, null, 2));

        if (!result.success) {
            throw new Error(`Tool execution failed: ${result.message || 'Unknown error'}`);
        }

        const joId = result.jo_id;
        console.log(`   Created JO ID: ${joId}`);

        // 3. Verify JO Data
        console.log('3. Verifying Job Order Data...');

        // We need to fetch the JO manually to check ingredients since the tool return might be simplified
        // Import JobOrder model dynamically or use dbStore logic if needed, but direct import is easier for test script
        const JobOrder = db.JobOrder;
        const JOIngredient = db.JOIngredient;

        const jo = await JobOrder.findByPk(joId, {
            include: [{ model: JOIngredient, as: 'ingredients' }]
        });

        if (!jo) throw new Error('Job Order not found in DB');

        console.log(`   JO Status: ${jo.status}`);
        if (jo.status !== 'in_progress') throw new Error(`Expected status 'in_progress', got '${jo.status}'`);


        console.log(`   Ingredients Count: ${jo.ingredients.length}`);
        if (jo.ingredients.length !== 1) throw new Error(`Expected 1 ingredient, got ${jo.ingredients.length}`);

        const joIng = jo.ingredients[0];
        console.log(`   Ingredient Quantity Required: ${joIng.quantity_required} (Expected: 10)`);

        // 5 units * 2kg/unit = 10kg
        if (parseFloat(joIng.quantity_required) !== 10) {
            throw new Error(`Expected quantity 10, got ${joIng.quantity_required}`);
        }

        // Verify Impact for UI
        if (!result.impact) console.warn('⚠️  Warning: Result missing impact object for UI');
        else console.log('✅ Result contains impact object');

        console.log('\n✅ VERIFICATION SUCCESSFUL: AI Tool correctly populated ingredients!');

    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        console.error('\n❌ VERIFICATION FAILED:', error);
        process.exit(1);
    }
}

verifyAiJoCreation();

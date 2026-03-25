/**
 * One-time script to calculate and populate nesting_level for all existing products of ALL tenants.
 * Run after database migrations: node backend/src/scripts/calculateNestingLevels.js
 */

import db from '../models/index.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';

async function buildDependencyGraph(ProductComposition) {
    const compositions = await ProductComposition.findAll({
        attributes: ['product_id', 'ingredient_id']
    });

    const graph = {};
    for (const comp of compositions) {
        const productId = comp.product_id.toString();
        const ingredientId = comp.ingredient_id.toString();
        if (!graph[productId]) {
            graph[productId] = [];
        }
        graph[productId].push(ingredientId);
    }
    return graph;
}

async function getItemCategories(Item) {
    const items = await Item.findAll({
        attributes: ['item_id', 'category']
    });

    const categoryMap = {};
    for (const item of items) {
        // Handle potentially different ID types, though usually int
        categoryMap[item.item_id.toString()] = item.category;
    }
    return categoryMap;
}

function calculateLevel(productId, graph, categoryMap, memo = {}) {
    if (memo[productId] !== undefined) return memo[productId];

    const ingredients = graph[productId];
    if (!ingredients || ingredients.length === 0) {
        memo[productId] = 0;
        return 0;
    }

    let maxChildLevel = -1;
    for (const ingredientId of ingredients) {
        if (categoryMap[ingredientId] === 'product') {
            const childLevel = calculateLevel(ingredientId, graph, categoryMap, memo);
            maxChildLevel = Math.max(maxChildLevel, childLevel);
        }
    }

    const level = maxChildLevel === -1 ? 0 : maxChildLevel + 1;
    memo[productId] = level;
    return level;
}

async function processTenant(tenantId, tenantName, models) {
    console.log(`\n🚀 Starting calculation for Tenant: ${tenantName} (${tenantId})`);

    const { Item, ProductComposition } = models;

    if (!Item || !ProductComposition) {
        console.error('  ❌ Required models (Item, ProductComposition) not found context.');
        return;
    }

    try {
        const graph = await buildDependencyGraph(ProductComposition);
        console.log(`  📊 Built dependency graph with ${Object.keys(graph).length} products`);

        const categoryMap = await getItemCategories(Item);
        console.log(`  📦 Loaded ${Object.keys(categoryMap).length} item categories`);

        const products = await Item.findAll({
            where: { category: 'product' },
            attributes: ['item_id', 'name']
        });
        console.log(`  🔍 Found ${products.length} products to process`);

        const memo = {};
        let updated = 0;

        for (const product of products) {
            const productId = product.item_id.toString();
            const nestingLevel = calculateLevel(productId, graph, categoryMap, memo);

            // Determine if leaf (not used by anyone)
            const isLeafNode = !Object.keys(graph).some(pid => graph[pid].includes(productId));

            await Item.update({
                nesting_level: nestingLevel,
                max_child_depth: Math.max(0, nestingLevel - 1),
                is_leaf_node: isLeafNode
            }, { where: { item_id: product.item_id } });

            if (nestingLevel > 0) {
                console.log(`    📝 ${product.name}: Level ${nestingLevel}`);
            }
            updated++;
        }

        // Set level 0 for raw ingredients
        const ingredientResult = await Item.update({
            nesting_level: 0,
            max_child_depth: 0,
            is_leaf_node: true
        }, { where: { category: 'ingredient' } });

        console.log(`  ✅ Updated ${updated} products`);
        console.log(`  ✅ Set ${ingredientResult[0]} raw ingredients to level 0`);

    } catch (error) {
        console.error(`  ❌ Error processing tenant ${tenantName}:`, error.message);
    }
}

async function run() {
    try {
        console.log('--- Nested Level Calculation Script ---');

        // 1. Process Default Tenant (Main DB)
        // This addresses the default context
        await processTenant('default', 'Default (Main)', db);

        // 2. Process all Active Tenants
        // We use the default DB to find tenants
        const tenants = await db.Tenant.findAll({
            where: { status: 'active' }
        });

        console.log(`\nFound ${tenants.length} active tenants.`);

        for (const tenant of tenants) {
            try {
                const sequelizeInstance = await tenantConnector.getConnection(tenant);
                const tenantModels = getTenantModels(sequelizeInstance);
                await processTenant(tenant.id, tenant.name, tenantModels);
            } catch (err) {
                console.error(`Failed to connect/process tenant ${tenant.name}:`, err);
            }
        }

        console.log('\n🎉 ALL DONE!');
        process.exit(0);
    } catch (error) {
        console.error('Critical Error:', error);
        process.exit(1);
    }
}

run();

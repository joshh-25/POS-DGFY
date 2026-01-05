/**
 * One-time script to calculate and populate nesting_level for all existing products
 * Run after database migrations: node backend/src/scripts/calculateNestingLevels.js
 */

import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import ProductComposition from '../models/ProductComposition.js';

async function buildDependencyGraph() {
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

async function getItemCategories() {
    const items = await Item.findAll({
        attributes: ['item_id', 'category']
    });

    const categoryMap = {};
    for (const item of items) {
        categoryMap[item.item_id.toString()] = item.category;
    }

    return categoryMap;
}

function calculateNestingLevel(productId, graph, categoryMap, memo = {}) {
    // Check memo first
    if (memo[productId] !== undefined) {
        return memo[productId];
    }

    // If no ingredients, it's level 0
    const ingredients = graph[productId];
    if (!ingredients || ingredients.length === 0) {
        memo[productId] = 0;
        return 0;
    }

    let maxChildLevel = -1;

    for (const ingredientId of ingredients) {
        // Only products contribute to nesting level
        if (categoryMap[ingredientId] === 'product') {
            // Recursively calculate child level
            const childLevel = calculateNestingLevel(ingredientId, graph, categoryMap, memo);
            maxChildLevel = Math.max(maxChildLevel, childLevel);
        }
    }

    // If no product ingredients, level is 0
    // Otherwise, level is max child level + 1
    const level = maxChildLevel === -1 ? 0 : maxChildLevel + 1;
    memo[productId] = level;

    return level;
}

async function run() {
    console.log('🚀 Starting nesting level calculation...');

    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        const graph = await buildDependencyGraph();
        console.log(`📊 Built dependency graph with ${Object.keys(graph).length} products`);

        const categoryMap = await getItemCategories();
        console.log(`📦 Loaded ${Object.keys(categoryMap).length} item categories`);

        // Get all products
        const products = await Item.findAll({
            where: { category: 'product' },
            attributes: ['item_id', 'name']
        });
        console.log(`🔍 Found ${products.length} products to process`);

        const memo = {};
        let updated = 0;

        for (const product of products) {
            const productId = product.item_id.toString();
            const nestingLevel = calculateNestingLevel(productId, graph, categoryMap, memo);

            // Check if any ingredients are products
            const ingredients = graph[productId] || [];
            const hasProductIngredient = ingredients.some(id => categoryMap[id] === 'product');
            const isLeafNode = !Object.keys(graph).some(pid =>
                graph[pid].includes(productId)
            );

            await Item.update({
                nesting_level: nestingLevel,
                max_child_depth: Math.max(0, nestingLevel - 1),
                is_leaf_node: isLeafNode
            }, { where: { item_id: product.item_id } });

            if (nestingLevel > 0) {
                console.log(`  📝 ${product.name}: Level ${nestingLevel}`);
            }
            updated++;
        }

        // Also set nesting_level=0 for all raw ingredients
        const ingredientResult = await Item.update({
            nesting_level: 0,
            max_child_depth: 0,
            is_leaf_node: true
        }, { where: { category: 'ingredient' } });

        console.log(`\n✅ Updated ${updated} products`);
        console.log(`✅ Set ${ingredientResult[0]} raw ingredients to level 0`);

        // Summary
        const summary = await Item.findAll({
            attributes: ['nesting_level', [sequelize.fn('COUNT', '*'), 'count']],
            where: { category: 'product' },
            group: ['nesting_level'],
            raw: true
        });

        console.log('\n📊 Nesting Level Summary:');
        for (const row of summary) {
            console.log(`  Level ${row.nesting_level || 0}: ${row.count} products`);
        }

        console.log('\n🎉 Done!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

run();

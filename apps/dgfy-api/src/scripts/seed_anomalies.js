import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import StockMovement from '../models/StockMovement.js';
import { Op } from 'sequelize';

const seedAnomalies = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Create or Find specific Test Item
        const [item, created] = await Item.findOrCreate({
            where: { sku_code: 'TEST-ANOMALY-001' },
            defaults: {
                name: 'Test Anomaly Part',
                category: 'Testing',
                unit: 'pcs',
                min_stock_level: 100,
                current_stock: 1000,
                reorder_point: 150,
                cost_per_unit: 50.00,
                status: 'active'
            }
        });

        console.log(`${created ? 'Created' : 'Found'} item: ${item.name}`);

        // Clear recent movements for this item to ensure clean slate for stats
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        await StockMovement.destroy({
            where: {
                item_id: item.item_id,
                timestamp: { [Op.gte]: thirtyDaysAgo }
            }
        });

        console.log('Cleared recent history for test item.');

        const movements = [];
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - 25);

        // 2. Seed "Normal" History (Days 1-20)
        // Consistent consumption of ~10 units/day to establish low Mean/StdDev
        for (let i = 0; i < 20; i++) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() + i);

            movements.push({
                item_id: item.item_id,
                movement_type: 'production_consumption',
                quantity: -10, // Normal usage
                reference_id: `AUTO-NORM-${i}`,
                timestamp: date,
                created_by: 1
            });
        }

        // 3. Inject "Spike" (Day 21) -> 100 units (10x normal)
        // This triggers CONSUMPTION_SPIKE
        const spikeDate = new Date();
        spikeDate.setDate(spikeDate.getDate() - 2);
        movements.push({
            item_id: item.item_id,
            movement_type: 'production_consumption',
            quantity: -150, // Massive spike
            reference_id: `AUTO-SPIKE-001`,
            timestamp: spikeDate,
            created_by: 1
        });

        // 4. Inject "High Loss" (Day 22)
        // Triggers HIGH_LOSS_EVENT
        const lossDate = new Date();
        lossDate.setDate(lossDate.getDate() - 1);
        movements.push({
            item_id: item.item_id,
            movement_type: 'waste',
            quantity: -500, // Huge waste event
            loss_reason: 'Testing Accident',
            reference_id: `AUTO-LOSS-001`,
            timestamp: lossDate,
            created_by: 1
        });

        // 5. Inject "Frequent Adjustments" (Last few days)
        // Triggers FREQUENT_ADJUSTMENTS (>3 in period)
        for (let i = 0; i < 5; i++) {
            movements.push({
                item_id: item.item_id,
                movement_type: 'adjustment',
                quantity: i % 2 === 0 ? 5 : -5,
                remarks: 'Manual correction',
                reference_id: `AUTO-ADJ-${i}`,
                timestamp: new Date(),
                created_by: 1
            });
        }

        await StockMovement.bulkCreate(movements);
        console.log(`Seeded ${movements.length} movements.`);
        console.log('Anomaly Conditions Injected:');
        console.log('- Consumption Spike: 150 units (vs 10 normal)');
        console.log('- High Loss: 500 units waste');
        console.log('- Frequent Adjustments: 5 manual events');

        process.exit(0);

    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seedAnomalies();


import StockMovement from '../src/models/StockMovement.js';
import Item from '../src/models/Item.js';
import User from '../src/models/User.js';
import sequelize from '../src/config/database.js';

async function testEnum() {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.create({
            username: 'enum_tester',
            password_hash: 'hash',
            email: 'enum@test.com'
        }, { transaction });

        const item = await Item.findOne() || await Item.create({
            sku_code: 'ENUM-TEST',
            name: 'Enum Test',
            category: 'product'
        }, { transaction });

        console.log('Testing "adjustment"...');
        await StockMovement.create({
            item_id: item.item_id,
            movement_type: 'adjustment',
            quantity: 1,
            reference_type: 'MANUAL',
            user_responsible: user.user_id
        }, { transaction });

        console.log('Testing "production_output"...');
        await StockMovement.create({
            item_id: item.item_id,
            movement_type: 'production_output',
            quantity: 1,
            reference_type: 'JO',
            user_responsible: user.user_id
        }, { transaction });

        console.log('Success! Enum allows these values.');
        await transaction.rollback();
    } catch (error) {
        console.error('Failed:', error.message);
        if (error.original) console.error('SQL Error:', error.original.sqlMessage);
        await transaction.rollback();
    }
}

testEnum();

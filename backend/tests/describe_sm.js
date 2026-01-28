
import sequelize from '../src/config/database.js';

async function describeTable() {
    try {
        const [results] = await sequelize.query('DESCRIBE stock_movements;');
        console.table(results);
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

describeTable();

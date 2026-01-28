
import sequelize from '../src/config/database.js';

async function describeTable() {
    try {
        const [results] = await sequelize.query('DESCRIBE job_orders;');
        console.table(results);
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

describeTable();

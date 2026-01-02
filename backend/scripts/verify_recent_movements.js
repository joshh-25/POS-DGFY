
import { getRecentMovements } from '../src/services/dashboardService.js';
import sequelize from '../src/config/database.js';
import '../src/models/index.js'; // Load associations

async function test() {
    try {
        console.log('Fetching recent movements...');
        const movements = await getRecentMovements(5);
        console.log('Result:', JSON.stringify(movements, null, 2));

        if (movements.length > 0) {
            const first = movements[0];
            if (first.id && first.created_date) {
                console.log('SUCCESS: Fields are correctly mapped.');
            } else {
                console.log('FAILURE: Missing expected fields.');
            }
        } else {
            console.log('WARNING: No movements found to verify against.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

test();

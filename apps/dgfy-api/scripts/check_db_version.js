
import db from '../src/models/index.js';

async function checkVersion() {
    try {
        await db.sequelize.authenticate();
        const [results] = await db.sequelize.query("SELECT VERSION() as version");
        console.log('MySQL Version:', results[0].version);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.sequelize.close();
    }
}

checkVersion();

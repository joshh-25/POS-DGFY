
import db from './src/models/index.js';
import logger from './src/config/logger.js';

async function diag() {
    console.log('--- DB Diagnostics ---');
    console.log('Database:', db.sequelize.config.database);
    console.log('Host:', db.sequelize.config.host);
    console.log('User:', db.sequelize.config.username);

    try {
        const [results] = await db.sequelize.query("SHOW TABLES;");
        console.log('Tables:', results.map(r => Object.values(r)[0]));

        const [meta] = await db.sequelize.query("SELECT * FROM sequelizemeta;");
        console.log('Migrations in Meta:', meta.map(m => m.name));
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

diag();

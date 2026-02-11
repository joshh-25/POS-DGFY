
import sequelize from '../src/config/database.js';
const queryInterface = sequelize.getQueryInterface();

async function migrate() {
    console.log('Starting surgical migration...');

    const tables = await queryInterface.showAllTables();
    console.log('Tables:', tables);

    const columns = await queryInterface.describeTable('tenants');
    console.log('Current columns in tenants:', Object.keys(columns));

    const newColumns = [
        { name: 'subscription_status', type: 'ENUM("active", "inactive", "past_due", "cancelled", "pending")', defaultValue: 'inactive' },
        { name: 'grace_period_end', type: 'DATETIME', allowNull: true },
        { name: 'cancelled_at', type: 'DATETIME', allowNull: true }
    ];

    for (const col of newColumns) {
        if (!columns[col.name]) {
            console.log(`Adding column ${col.name}...`);
            // Raw query for ENUM to avoid issues
            if (col.name === 'subscription_status') {
                await sequelize.query(`ALTER TABLE tenants ADD COLUMN subscription_status ENUM('active', 'inactive', 'past_due', 'cancelled', 'pending') DEFAULT 'inactive'`);
            } else {
                await sequelize.query(`ALTER TABLE tenants ADD COLUMN ${col.name} ${col.type}`);
            }
            console.log(`✅ Added ${col.name}`);
        } else {
            console.log(`Column ${col.name} already exists.`);
        }
    }

    // Also ensure WebhookLog table exists
    try {
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS webhook_logs (
                id INTEGER PRIMARY KEY AUTO_INCREMENT,
                webhook_id VARCHAR(255) UNIQUE NOT NULL,
                event_type VARCHAR(255),
                status VARCHAR(50) DEFAULT 'received',
                error_message TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        `);
        console.log('✅ WebhookLog table checked/created.');
    } catch (e) {
        console.error('❌ WebhookLog creation failed:', e.message);
    }

    console.log('\nMigration finished!');
    await sequelize.close();
    process.exit();
}

migrate();

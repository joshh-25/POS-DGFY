
import { Sequelize } from 'sequelize';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
// Import the service - adjusted path for relative imports inside the service to work
// We might need to mock models/index.js if it relies on dynamic loading
import { generateAlerts } from '../src/services/alertService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Setup Global Sequelize instance if models/index.js expects it
// However, typically models initialize themselves. 
// Let's try importing the models to ensure they are initialized.
import '../src/models/index.js';

async function debug() {
    try {
        console.log('--- Starting Alert Service Debug ---');
        console.log('Time:', new Date().toISOString());

        const alerts = await generateAlerts();

        console.log(`Generated ${alerts.length} total alerts.`);

        const expiryAlerts = alerts.filter(a => a.type === 'expiring_batch' || a.type === 'missing_expiry_date');
        console.log(`Found ${expiryAlerts.length} expiry-related alerts.`);

        expiryAlerts.forEach(a => {
            console.log(`\nType: ${a.type}`);
            console.log(`Item: ${a.item_name}`);
            console.log(`Batch: ${a.batch_id}`);
            console.log(`Expiry: ${a.expiry_date}`);
            console.log(`Severity: ${a.severity}`);
            console.log(`Message: ${a.message}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

debug();

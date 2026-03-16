import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Sequelize } from 'sequelize';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const MAIN_DB = process.env.DB_NAME || 'sku_inventory_manager';
const TENANT_DB = 'tenant_premium';
const TENANT_NAME = 'Premium Corp';
const TENANT_ID = '3a608773-edb7-46e8-be7f-29837e4944f1';

async function seedData() {
    // 1. Connect to MySQL without a database to create the tenant DB if missing
    const rootConnection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD
    });

    try {
        console.log(`--- Setting up QA Environment (${TENANT_NAME}) ---`);
        
        // Create Tenant Database
        console.log(`📦 Ensuring database ${TENANT_DB} exists...`);
        await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${TENANT_DB}\``);

        // Register Tenant in Landlord DB
        console.log(`📋 Registering tenant in ${MAIN_DB}...`);
        await rootConnection.query(`USE \`${MAIN_DB}\``);
        await rootConnection.query(`
            INSERT INTO tenants (id, name, db_name, company_token, status, plan, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE status = 'active', plan = 'premium'
        `, [TENANT_ID, TENANT_NAME, TENANT_DB, 'qa-test-token', 'active', 'premium']);

        await rootConnection.end();

        // 2. Sync Schema for the Tenant DB
        console.log(`🔄 Syncing schema for ${TENANT_DB}...`);
        const tenantSequelize = new Sequelize(TENANT_DB, DB_USER, DB_PASSWORD, {
            host: DB_HOST,
            dialect: 'mysql',
            logging: false
        });

        getTenantModels(tenantSequelize);
        await tenantSequelize.sync({ alter: true });
        await tenantSequelize.close();

        // 3. Connect to the Tenant DB to seed data
        const connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: TENANT_DB
        });

        console.log('🌱 Seeding test data...');
        
        // 1. Seed User (Robustly)
        await connection.query(`
            REPLACE INTO users (user_id, username, email, role, password_hash, is_active, is_master_admin) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [1, 'admin', 'admin@premiumcorp.com', 'admin', '$2b$10$X.f7Lg0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0', 1, 1]);
        console.log('Seeded/Updated admin user.');

        // 2. Update Sugar (item_id 1 assumes name 'QA Sugar Test')
        const [sugarRows] = await connection.query('SELECT item_id FROM items WHERE name = ?', ['QA Sugar Test']);
        let sugarId = sugarRows[0]?.item_id;

        if (!sugarId) {
            const [sugarRes] = await connection.query('INSERT INTO items (name, sku_code, category, status, cost_per_unit, current_stock, fifo_enabled, unit_of_measure, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                ['QA Sugar Test', 'SUG-001', 'Raw Material', 'active', 0.5, 100000, 1, 'kg', TENANT_ID]);
            sugarId = sugarRes.insertId;
        } else {
            await connection.query('UPDATE items SET status = "active", cost_per_unit = 0.5, current_stock = 100000, fifo_enabled = 1, unit_of_measure = "kg" WHERE item_id = ?', [sugarId]);
        }
        console.log(`Ensured Sugar exists (ID: ${sugarId}).`);

        // 3. Add Flour for analytics
        await connection.query('INSERT IGNORE INTO items (name, sku_code, category, status, cost_per_unit, current_stock, fifo_enabled, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['QA Flour Test', 'FLR-001', 'Raw Material', 'active', 0.8, 5000, 1, TENANT_ID]);
        console.log('Ensured Flour exists for analytics.');

        // 4. Create Supplier
        const [suppliers] = await connection.query('SELECT supplier_id FROM suppliers WHERE name = ?', ['QA Supplier']);
        let supplierId;
        if (suppliers.length === 0) {
            const [supplierRes] = await connection.query(
                'INSERT INTO suppliers (name, contact_person, email, status, tenant_id) VALUES (?, ?, ?, ?, ?)',
                ['QA Supplier', 'John Doe', 'john@qasupplier.com', 'active', TENANT_ID]
            );
            supplierId = supplierRes.insertId;
        } else {
            supplierId = suppliers[0].supplier_id;
        }
        console.log(`Supplier ID: ${supplierId}`);

        // 5. Create FIFO Batches for Sugar
        await connection.query('DELETE FROM fifo_batches WHERE item_id = ?', [sugarId]);
        await connection.query(
            'INSERT INTO fifo_batches (item_id, quantity, cost_per_unit, received_date, po_number, quantity_consumed, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [sugarId, 50000, 0.5, '2026-01-01', 'PO-001', 0, TENANT_ID]
        );
        await connection.query(
            'INSERT INTO fifo_batches (item_id, quantity, cost_per_unit, received_date, po_number, quantity_consumed, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [sugarId, 50000, 0.5, '2026-02-01', 'PO-002', 0, TENANT_ID]
        );
        console.log('Created FIFO batches for Sugar.');

        // 6. Update Product (item_id 3)
        const [productRows] = await connection.query('SELECT item_id FROM items WHERE name LIKE ?', ['%QA Test Product%']);
        let productId = productRows[0]?.item_id;

        if (!productId) {
            const [productRes] = await connection.query('INSERT INTO items (name, sku_code, category, status, batch_size, cost_per_unit, yield_percentage, max_capacity, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                ['QA Test Product 2026-02-18', 'TP-999', 'Finished Goods', 'active', 500, 250, 98, 10000, TENANT_ID]);
            productId = productRes.insertId;
        } else {
            await connection.query('UPDATE items SET status = "active", batch_size = 500, cost_per_unit = 250, yield_percentage = 98, max_capacity = 10000 WHERE item_id = ?', [productId]);
        }
        console.log(`Ensured Product exists (ID: ${productId}).`);

        // 7. Ensure Composition
        await connection.query('REPLACE INTO product_composition (product_id, ingredient_id, quantity_required, tenant_id) VALUES (?, ?, ?, ?)',
            [productId, sugarId, 10, TENANT_ID]);
        console.log('Ensured product composition.');

        // 8. Create a Completed Job Order for Traceability
        await connection.query('DELETE FROM job_orders WHERE tenant_id = ?', [TENANT_ID]);
        const [joRes] = await connection.query(`
            INSERT INTO job_orders (product_id, quantity_to_produce, quantity_produced, status, tenant_id, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `, [productId, 100, 100, 'completed', TENANT_ID]);
        const joId = joRes.insertId;
        console.log(`Created completed JO: ${joId}`);

        // 9. Create Stock Movements
        await connection.query('DELETE FROM stock_movements WHERE tenant_id = ?', [TENANT_ID]);
        await connection.query(`
            INSERT INTO stock_movements (item_id, movement_type, quantity, tenant_id, user_responsible, timestamp)
            VALUES (?, ?, ?, ?, ?, NOW())
        `, [sugarId, 'adjustment', 1000, TENANT_ID, 1]);
        console.log('Created stock movement for traceability.');

        await connection.end();
        console.log('\n✨ QA Environment setup and seeded successfully.');

    } catch (error) {
        console.error('❌ Setup failed:', error);
        process.exit(1);
    }
}

seedData();

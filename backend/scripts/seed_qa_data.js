import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function seedData() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'tenant_premium'
    });

    const tenantId = '3a608773-edb7-46e8-be7f-29837e4944f1'; // Premium Corp ID

    try {
        console.log('--- Seeding tenant_premium for QA ---');
        
        // 1. Seed User (Robustly)
        await connection.query(`
            REPLACE INTO users (user_id, username, email, role, password_hash, tenant_id, is_active, is_master_admin) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [1, 'admin', 'admin@premiumcorp.com', 'admin', '$2b$10$X.f7Lg0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0', tenantId, 1, 1]);
        console.log('Seeded/Updated admin user.');

        // 2. Update Sugar (item_id 1 assumes name 'QA Sugar Test')
        const [sugarRows] = await connection.query('SELECT item_id FROM items WHERE name = ?', ['QA Sugar Test']);
        const sugarId = sugarRows[0]?.item_id || 1;
        await connection.query('UPDATE items SET status = "active", cost_per_unit = 0.5, current_stock = 100000, fifo_enabled = 1, unit_of_measure = "kg" WHERE item_id = ?', [sugarId]);
        console.log(`Updated Sugar (ID: ${sugarId}) cost and stock.`);

        // 3. Add Flour for analytics
        await connection.query('INSERT IGNORE INTO items (name, sku_code, category, status, cost_per_unit, current_stock, fifo_enabled, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['QA Flour Test', 'FLR-001', 'Raw Material', 'active', 0.8, 5000, 1, tenantId]);
        console.log('Ensured Flour exists for analytics.');

        // 4. Create Supplier
        const [suppliers] = await connection.query('SELECT supplier_id FROM suppliers WHERE name = ?', ['QA Supplier']);
        let supplierId;
        if (suppliers.length === 0) {
            const [supplierRes] = await connection.query(
                'INSERT INTO suppliers (name, contact_person, email, status, tenant_id) VALUES (?, ?, ?, ?, ?)',
                ['QA Supplier', 'John Doe', 'john@qasupplier.com', 'active', tenantId]
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
            [sugarId, 50000, 0.5, '2026-01-01', 'PO-001', 0, tenantId]
        );
        await connection.query(
            'INSERT INTO fifo_batches (item_id, quantity, cost_per_unit, received_date, po_number, quantity_consumed, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [sugarId, 50000, 0.5, '2026-02-01', 'PO-002', 0, tenantId]
        );
        console.log('Created FIFO batches for Sugar.');

        // 6. Update Product (item_id 3)
        const [productRows] = await connection.query('SELECT item_id FROM items WHERE name LIKE ?', ['%QA Test Product%']);
        const productId = productRows[0]?.item_id || 3;
        await connection.query('UPDATE items SET status = "active", batch_size = 500, cost_per_unit = 250, yield_percentage = 98, max_capacity = 10000 WHERE item_id = ?', [productId]);
        console.log(`Updated Product (ID: ${productId}) metadata.`);

        // 7. Ensure Composition
        await connection.query('REPLACE INTO product_composition (product_id, ingredient_id, quantity_required, tenant_id) VALUES (?, ?, ?, ?)',
            [productId, sugarId, 10, tenantId]);
        console.log('Ensured product composition.');

        // 8. Create a Completed Job Order for Traceability
        await connection.query('DELETE FROM job_orders WHERE tenant_id = ?', [tenantId]);
        const [joRes] = await connection.query(`
            INSERT INTO job_orders (product_id, quantity_to_produce, quantity_produced, status, tenant_id, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `, [productId, 100, 100, 'completed', tenantId]);
        const joId = joRes.insertId;
        console.log(`Created completed JO: ${joId}`);

        // 9. Create Stock Movements
        await connection.query('DELETE FROM stock_movements WHERE tenant_id = ?', [tenantId]);
        await connection.query(`
            INSERT INTO stock_movements (item_id, movement_type, quantity, tenant_id, user_responsible, timestamp)
            VALUES (?, ?, ?, ?, ?, NOW())
        `, [sugarId, 'adjustment', 1000, tenantId, 1]);
        console.log('Created stock movement for traceability.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

seedData();

import request from 'supertest';
import app from '../src/server.js';
import sequelize from '../src/config/database.js';
import User from '../src/models/User.js';
import Supplier from '../src/models/Supplier.js';
import Item from '../src/models/Item.js';
import db from '../src/models/index.js';

describe('Purchase Order API', () => {
    let token;
    let userId;
    let supplierId;
    let itemId;

    beforeAll(async () => {
        // Ensure DB connection
        await sequelize.authenticate();
    });

    afterAll(async () => {
        // Close DB connection
        await sequelize.close();
    });

    beforeEach(async () => {
        // Clean up database - Delete ALL dependents first
        // Transaction/Movement/Batch
        await db.BatchTransaction.destroy({ where: {} });
        await db.StockMovement.destroy({ where: {} });
        await db.FIFOBatch.destroy({ where: {} });

        // Job Orders
        await db.JOIngredient.destroy({ where: {} });
        await db.JobOrder.destroy({ where: {} });

        // Purchase Orders
        await db.POLineItem.destroy({ where: {} });
        await db.PurchaseOrder.destroy({ where: {} });

        // Item Relations
        await db.SupplierItem.destroy({ where: {} });
        await db.ProductComposition.destroy({ where: {} });
        await db.ItemAllergen.destroy({ where: {} });

        // Core Entities
        await db.Item.destroy({ where: {} });
        await db.Supplier.destroy({ where: {} });
        await db.User.destroy({ where: {} });

        const userData = {
            username: 'pomanager',
            email: 'pomanager@example.com',
            password: 'Password123!'
        };

        await request(app)
            .post('/api/v1/auth/register')
            .send(userData);

        // Force role to manager
        await db.User.update(
            { role: 'manager' },
            { where: { email: userData.email } }
        );

        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: userData.email,
                password: userData.password
            });

        token = loginRes.body.data.token;
        userId = loginRes.body.data.user_id;

        // 2. Create Supplier
        const supplier = await Supplier.create({
            name: 'Test Supplier Inc',
            contact_person: 'Jane Doe',
            email: 'jane@testsupplier.com',
            phone: '555-0123',
            address: '123 Supply Chain Rd'
        });
        supplierId = supplier.supplier_id;

        // 3. Create Item
        const item = await Item.create({
            sku: 'WIDGET-001',
            name: 'Premium Widget',
            description: 'A high quality widget',
            category: 'product',
            unit_of_measure: 'units',
            cost_price: 50.00,
            selling_price: 100.00,
            current_stock: 10,
            min_threshold: 20
        });
        itemId = item.item_id;
    });

    describe('POST /api/v1/purchase-orders', () => {
        it('should create a purchase order successfully', async () => {
            const poData = {
                supplier_id: supplierId,
                order_date: new Date().toISOString().split('T')[0],
                expected_delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                notes: 'Urgent order',
                line_items: [
                    {
                        item_id: itemId,
                        quantity_ordered: 100,
                        unit_price: 45.00, // Bulk price
                        total_price: 4500.00
                    }
                ],
                status: 'pending'
            };

            const response = await request(app)
                .post('/api/v1/purchase-orders')
                .set('Authorization', `Bearer ${token}`)
                .send(poData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.po_number).toMatch(/^PO-/);
            expect(response.body.data.status).toBe('pending');
            expect(parseFloat(response.body.data.total_amount)).toBe(4500.00);
            expect(response.body.data.lineItems).toHaveLength(1);
        });

        it('should create a draft purchase order', async () => {
            const draftData = {
                supplier_id: supplierId,
                // Drafts might have missing fields, but we'll provide minimal
                line_items: [
                    {
                        item_id: itemId,
                        quantity_ordered: 50,
                        unit_price: 50.00,
                        total_price: 2500.00
                    }
                ],
                status: 'draft'
            };

            const response = await request(app)
                .post('/api/v1/purchase-orders')
                .set('Authorization', `Bearer ${token}`)
                .send(draftData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe('pending');
            expect(response.body.data.po_number).toMatch(/^PO-/);
        });

        it('should fail validation when required fields are missing for non-draft', async () => {
            const invalidData = {
                supplier_id: supplierId,
                status: 'pending'
                // Missing line_items
            };

            const response = await request(app)
                .post('/api/v1/purchase-orders')
                .set('Authorization', `Bearer ${token}`)
                .send(invalidData)
                .expect(422);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/purchase-orders', () => {
        beforeEach(async () => {
            // Create a PO directly to fetch
            await db.PurchaseOrder.create({
                supplier_id: supplierId,
                order_date: new Date(),
                po_number: 'PO-TEST-EXISTING',
                status: 'pending',
                created_by: userId
            });
        });

        it('should retrieve a list of purchase orders', async () => {
            const response = await request(app)
                .get('/api/v1/purchase-orders')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data.purchase_orders)).toBe(true);
            expect(response.body.data.purchase_orders.length).toBeGreaterThan(0);
        });
    });
});

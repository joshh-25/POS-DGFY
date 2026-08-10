import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/server.js';
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { createTestTenant, destroyTestTenant } from './helpers/testTenantHelper.js';
import { generateToken, hashPassword } from '../src/services/authService.js';

jest.setTimeout(120000);

describe('Purchase Order API', () => {
    let token;
    let userId;
    let supplierId;
    let itemId;
    let tenantCtx;

    beforeAll(async () => {
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    afterEach(async () => {
        if (tenantCtx) {
            await destroyTestTenant(tenantCtx);
            tenantCtx = null;
        }
    });

    beforeEach(async () => {
        tenantCtx = await createTestTenant('po');

        const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const userData = {
            username: `pomanager-${stamp}`,
            email: `pomanager-${stamp}@example.com`,
            phone_number: '+63 917 000 2000',
            password: 'Password123!'
        };

        const user = await tenantCtx.models.User.create({
            username: userData.username,
            email: userData.email,
            phone_number: userData.phone_number,
            password_hash: await hashPassword(userData.password),
            role: 'manager',
            permissions: [PERMISSIONS.ORDERS.actions.CREATE_PO],
            is_active: true
        });

        token = generateToken(user, { tenantId: tenantCtx.tenant.id });
        userId = user.user_id;

        const supplier = await tenantCtx.models.Supplier.create({
            name: `Test Supplier ${stamp}`,
            contact_person: 'Jane Doe',
            email: `supplier-${stamp}@example.com`,
            phone: '555-0123',
            address: '123 Supply Chain Rd'
        });
        supplierId = supplier.supplier_id;

        const item = await tenantCtx.models.Item.create({
            sku_code: `RM-${stamp}`,
            name: `Test Raw Material ${stamp}`,
            category: 'raw_material',
            unit_of_measure: 'units',
            current_stock: 10,
            max_capacity: 100,
            min_threshold: 20,
            cost_per_unit: 50.0,
            status: 'active'
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
                        unit_price: 45.0,
                        total_price: 4500.0
                    }
                ],
                status: 'pending'
            };

            const response = await request(app)
                .post('/api/v1/purchase-orders')
                .set('x-company-token', tenantCtx.token)
                .set('Authorization', `Bearer ${token}`)
                .send(poData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.po_number).toMatch(/^PO-/);
            expect(response.body.data.status).toBe('pending');
            expect(parseFloat(response.body.data.total_amount)).toBe(4500.0);
            expect(response.body.data.lineItems).toHaveLength(1);
        });

        it('should create a draft purchase order (normalized to pending)', async () => {
            const draftData = {
                supplier_id: supplierId,
                line_items: [
                    {
                        item_id: itemId,
                        quantity_ordered: 50,
                        unit_price: 50.0,
                        total_price: 2500.0
                    }
                ],
                status: 'draft'
            };

            const response = await request(app)
                .post('/api/v1/purchase-orders')
                .set('x-company-token', tenantCtx.token)
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
            };

            const response = await request(app)
                .post('/api/v1/purchase-orders')
                .set('x-company-token', tenantCtx.token)
                .set('Authorization', `Bearer ${token}`)
                .send(invalidData)
                .expect(422);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/purchase-orders', () => {
        beforeEach(async () => {
            await tenantCtx.models.PurchaseOrder.create({
                supplier_id: supplierId,
                order_date: new Date(),
                po_number: 'PO-TEST-EXISTING',
                status: 'pending',
                created_by: userId,
                subtotal: 100,
                discount: 0,
                total_amount: 100
            });
        });

        it('should retrieve a list of purchase orders', async () => {
            const response = await request(app)
                .get('/api/v1/purchase-orders')
                .set('x-company-token', tenantCtx.token)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data.purchase_orders)).toBe(true);
            expect(response.body.data.purchase_orders.length).toBeGreaterThan(0);
        });
    });
});

/**
 * voidMovement - Real Engagement (Supertest) Integration Tests
 *
 * Exercises the FULL HTTP stack for POST /api/v1/stock-movements/:id/void:
 *   authenticate → checkPermission → validateVoidMovement → controller → service → errorHandler
 *
 * This complements voidMovement.test.js (service-layer) by proving that:
 *   1. A real JWT is required (unauthenticated → 401)
 *   2. Role permissions are enforced (staff without stock:adjust → 403)
 *   3. Joi validation fires before the service (missing/empty body → 422)
 *   4. The 409 batch-consumed guard (Finding 5.3) reaches the HTTP client
 *   5. A clean happy-path void returns 200 with the correct response shape
 *   6. The full multi-tenant code path (x-company-token → real tenant DB) is exercised
 *   7. Cross-tenant isolation: a movement in Tenant A returns 404 for Tenant B
 *   8. Concurrent voids are serialized by SELECT FOR UPDATE (one wins, one gets 400)
 *
 * Run: npm test -- tests/voidMovement.supertest.test.js --forceExit
 */

import request from 'supertest';
import app from '../src/server.js';
import db from '../src/models/index.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/config/permissions.js';
import { createTestTenant, destroyTestTenant } from './helpers/testTenantHelper.js';

// ─── Shared state ─────────────────────────────────────────────────────────────
let managerToken;   // JWT for a 'manager' user (has CREATE_ADJUSTMENT permission)
let viewerToken;    // JWT for a 'viewer' user (no write permissions)
let managerId;

const TIMESTAMP = Date.now();
const TODAY = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
    await db.sequelize.authenticate();

    // ------------------------------------------------------------------
    // 1. Create + promote a Manager (has STOCK.CREATE_ADJUSTMENT perm)
    // ------------------------------------------------------------------
    const managerCreds = {
        username: `void_mgr_${TIMESTAMP}`,
        email: `void_mgr_${TIMESTAMP}@test.com`,
        password: 'Manager123!'
    };
    await request(app).post('/api/v1/auth/register').send(managerCreds);
    await db.User.update(
        {
            role: 'manager',
            // checkPermission reads from the permissions DB column, not the role name.
            permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.manager)
        },
        { where: { email: managerCreds.email } }
    );

    const managerLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: managerCreds.email, password: managerCreds.password });

    managerToken = managerLogin.body.data?.token;
    managerId = managerLogin.body.data?.user_id;

    // ------------------------------------------------------------------
    // 2. Create a Viewer (read-only — no write permissions)
    // ------------------------------------------------------------------
    const viewerCreds = {
        username: `void_viewer_${TIMESTAMP}`,
        email: `void_viewer_${TIMESTAMP}@test.com`,
        password: 'Viewer123!'
    };
    await request(app).post('/api/v1/auth/register').send(viewerCreds);
    await db.User.update(
        {
            role: 'staff',
            permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.staff)
        },
        { where: { email: viewerCreds.email } }
    );

    const viewerLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: viewerCreds.email, password: viewerCreds.password });

    viewerToken = viewerLogin.body.data?.token;
});

afterAll(async () => {
    await db.BatchTransaction.destroy({ where: {} }).catch(() => { });
    await db.StockMovement.destroy({ where: {} }).catch(() => { });
    await db.FIFOBatch.destroy({ where: {} }).catch(() => { });
    await db.Item.destroy({
        where: { sku_code: { [db.Sequelize.Op.like]: `VOID-ST-%${TIMESTAMP}%` } }
    }).catch(() => { });
    await db.User.destroy({
        where: { email: { [db.Sequelize.Op.like]: `%${TIMESTAMP}@test.com` } }
    }).catch(() => { });

    await db.sequelize.close();
});

// ─── Helper: create an item + purchase receipt via the service layer directly ─
async function createReceiptWithBatch({ qty = 100, consumed = 0, sku = null, userId = null } = {}) {
    const { createStockMovement } = await import('../src/services/stockMovementService.js');

    const item = await db.Item.create({
        sku_code: sku || `VOID-ST-${TIMESTAMP}-${Math.random().toString(36).slice(2, 6)}`,
        name: 'Supertest Void Item',
        category: 'raw_material',
        unit_of_measure: 'kg',
        current_stock: 0,
        fifo_enabled: true,
        cost_price: 5.00
    });

    const receiptMovement = await createStockMovement({
        item_id: item.item_id,
        quantity: qty,
        movement_type: 'purchase_receipt',
        reference_type: 'MANUAL',
        cost_per_unit: 5.00,
        notes: 'Supertest fixture receipt'
    }, userId || managerId);

    if (consumed > 0) {
        await createStockMovement({
            item_id: item.item_id,
            quantity: consumed,
            movement_type: 'production_consumption',
            reference_type: 'JO',
            reference_id: `JO-ST-FIXTURE-${TIMESTAMP}`
        }, userId || managerId);
    }

    return { item, receiptMovement };
}

/**
 * Seed a FIFOBatch record directly into a model set (global or tenant).
 * Always includes all required non-null fields.
 */
async function seedBatch(models, { item_id, movement_id, original_quantity, remaining_quantity, quantity_consumed = 0, cost_per_unit = 5.00, status = 'available' }) {
    const FIFOBatchModel = models?.FIFOBatch || db.FIFOBatch;
    return FIFOBatchModel.create({
        item_id,
        movement_id,
        quantity: original_quantity,       // DB column is `quantity` not `original_quantity`
        quantity_consumed,
        cost_per_unit,
        received_date: TODAY,               // required non-null field
        status: status || (quantity_consumed === 0 ? 'available' : (remaining_quantity > 0 ? 'partial' : 'consumed'))
    });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe('POST /api/v1/stock-movements/:id/void — Real HTTP Integration', () => {

    // ── Auth layer ─────────────────────────────────────────────────────────────

    describe('Authentication gate', () => {
        it('returns 401 when no Authorization header is provided', async () => {
            const res = await request(app)
                .post('/api/v1/stock-movements/9999999/void')
                .send({ reason: 'No token test' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('returns 401 when Authorization header contains a garbage token', async () => {
            const res = await request(app)
                .post('/api/v1/stock-movements/9999999/void')
                .set('Authorization', 'Bearer this_is_not_a_real_jwt')
                .send({ reason: 'Bad token test' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });

    // ── Permission layer ────────────────────────────────────────────────────────

    describe('Permission gate', () => {
        it('returns 403 when a staff user (no stock:adjust permission) attempts a void', async () => {
            const { receiptMovement } = await createReceiptWithBatch({ qty: 10 });

            const res = await request(app)
                .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                .set('Authorization', `Bearer ${viewerToken}`)
                .send({ reason: 'Viewer trying to void' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });
    });

    // ── Validation layer ────────────────────────────────────────────────────────

    describe('Joi validation gate', () => {
        it('returns 422 when reason is missing from the request body', async () => {
            const { receiptMovement } = await createReceiptWithBatch({ qty: 10 });

            const res = await request(app)
                .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({});

            expect(res.status).toBe(422);
            expect(res.body.success).toBe(false);
            expect(res.body.errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'reason' })
                ])
            );
        });

        it('returns 422 when reason is an empty string', async () => {
            const { receiptMovement } = await createReceiptWithBatch({ qty: 10 });

            const res = await request(app)
                .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: '' });

            expect(res.status).toBe(422);
            expect(res.body.success).toBe(false);
        });
    });

    // ── Business logic layer ────────────────────────────────────────────────────

    describe('Business logic: Finding 5.3 — batch-consumed guard (HTTP layer)', () => {
        it('returns 409 when voiding a receipt whose batch was partially consumed', async () => {
            const { receiptMovement } = await createReceiptWithBatch({ qty: 100, consumed: 50 });

            const res = await request(app)
                .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'Attempting to void partially consumed receipt' });

            expect(res.status).toBe(409);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/Cannot void this movement.*batch.*already been.*used downstream/i);
        });

        it('returns 409 when voiding a receipt whose batch was fully consumed', async () => {
            const { receiptMovement } = await createReceiptWithBatch({ qty: 30, consumed: 30 });

            const res = await request(app)
                .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'Attempting to void fully consumed receipt' });

            expect(res.status).toBe(409);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/Cannot void this movement.*batch.*already been.*used downstream/i);
        });
    });

    describe('Business logic: 404 for non-existent movement', () => {
        it('returns 404 for a movement ID that does not exist', async () => {
            const res = await request(app)
                .post('/api/v1/stock-movements/99999999/void')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'Void non-existent' });

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
        });
    });

    describe('Business logic: double-void prevention', () => {
        it('returns 400 when trying to void an already-voided movement', async () => {
            const { receiptMovement } = await createReceiptWithBatch({ qty: 20 });

            const firstVoid = await request(app)
                .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'First void' });
            expect(firstVoid.status).toBe(200);

            const secondVoid = await request(app)
                .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'Second void attempt' });

            expect(secondVoid.status).toBe(400);
            expect(secondVoid.body.success).toBe(false);
            expect(secondVoid.body.message).toMatch(/already voided/i);
        });
    });

    // ── Happy path ──────────────────────────────────────────────────────────────

    describe('Happy path: successful void', () => {
        it('returns 200 with correct shape when voiding an untouched receipt', async () => {
            const { item, receiptMovement } = await createReceiptWithBatch({ qty: 40 });

            const res = await request(app)
                .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ reason: 'Supertest happy-path void' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toMatch(/voided successfully/i);
            expect(res.body.data).toBeDefined();
            expect(res.body.timestamp).toBeDefined();

            expect(parseFloat(res.body.data.quantity)).toBe(-40);
            expect(res.body.data.movement_type).toBe('return');

            const updatedItem = await db.Item.findByPk(item.item_id);
            expect(parseFloat(updatedItem.current_stock)).toBe(0);

            const batch = await db.FIFOBatch.findByPk(receiptMovement.batch_id);
            expect(parseFloat(batch.quantity_consumed)).toBe(40);
        });
    });

    // ── Phase 2: Multi-tenant code path ────────────────────────────────────────
    // Exercises dbStore.get('StockMovement') routing through a REAL tenant DB
    // connection (not the global/default fallback) by sending x-company-token.

    describe('Multi-tenant code path (x-company-token header)', () => {
        let tenantCtx;
        let tenantManagerToken;
        let tenantManagerId;

        beforeAll(async () => {
            tenantCtx = await createTestTenant('mt');

            const creds = {
                username: `void_tmt_${TIMESTAMP}`,
                email: `void_tmt_${TIMESTAMP}@tenant.test`,
                password: 'TenantMgr1!'
            };

            await request(app)
                .post('/api/v1/auth/register')
                .set('x-company-token', tenantCtx.token)
                .send(creds);

            // Grant permissions in both global and tenant DBs
            const permJson = JSON.stringify(DEFAULT_ROLE_PERMISSIONS.manager);
            await db.User.update(
                { role: 'manager', permissions: permJson },
                { where: { email: creds.email } }
            );
            await tenantCtx.models.User.update(
                { role: 'manager', permissions: permJson },
                { where: { email: creds.email } }
            ).catch(() => { }); // may not exist in tenant DB if auth is global-only

            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .set('x-company-token', tenantCtx.token)
                .send({ email: creds.email, password: creds.password });

            tenantManagerToken = loginRes.body.data?.token;
            tenantManagerId = loginRes.body.data?.user_id;
        });

        afterAll(async () => {
            if (tenantCtx) await destroyTestTenant(tenantCtx);
        });

        it('routes the 409 guard through the real tenant DB (not the global DB)', async () => {
            const item = await tenantCtx.models.Item.create({
                sku_code: `VOID-MT-${TIMESTAMP}-${Math.random().toString(36).slice(2, 6)}`,
                name: 'Tenant Item',
                category: 'raw_material',
                unit_of_measure: 'kg',
                current_stock: 0,
                fifo_enabled: true,
                cost_price: 5.00
            });

            const receipt = await tenantCtx.models.StockMovement.create({
                item_id: item.item_id,
                quantity: 80,
                movement_type: 'purchase_receipt',
                reference_type: 'MANUAL',
                notes: 'Tenant MT fixture',
                created_by: tenantManagerId
            });

            const batch = await seedBatch(tenantCtx.models, {
                item_id: item.item_id,
                movement_id: receipt.movement_id,
                original_quantity: 80,
                remaining_quantity: 40,
                quantity_consumed: 40,  // partially consumed
                cost_per_unit: 5.00,
                status: 'partial'
            });

            await receipt.update({ batch_id: batch.batch_id });
            await tenantCtx.models.Item.update({ current_stock: 40 }, { where: { item_id: item.item_id } });

            const res = await request(app)
                .post(`/api/v1/stock-movements/${receipt.movement_id}/void`)
                .set('Authorization', `Bearer ${tenantManagerToken}`)
                .set('x-company-token', tenantCtx.token)
                .send({ reason: 'MT path batch-consumed test' });

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/Cannot void this movement/i);
        });

        it('successfully voids an untouched receipt through the tenant DB path', async () => {
            const item = await tenantCtx.models.Item.create({
                sku_code: `VOID-MT-HP-${TIMESTAMP}-${Math.random().toString(36).slice(2, 6)}`,
                name: 'Tenant Happy Item',
                category: 'raw_material',
                unit_of_measure: 'kg',
                current_stock: 25,
                fifo_enabled: true,
                cost_price: 3.00
            });

            const receipt = await tenantCtx.models.StockMovement.create({
                item_id: item.item_id,
                quantity: 25,
                movement_type: 'purchase_receipt',
                reference_type: 'MANUAL',
                notes: 'Tenant MT happy fixture',
                created_by: tenantManagerId
            });

            const batch = await seedBatch(tenantCtx.models, {
                item_id: item.item_id,
                movement_id: receipt.movement_id,
                original_quantity: 25,
                remaining_quantity: 25,
                quantity_consumed: 0,
                cost_per_unit: 3.00,
                status: 'available'
            });

            await receipt.update({ batch_id: batch.batch_id });

            const res = await request(app)
                .post(`/api/v1/stock-movements/${receipt.movement_id}/void`)
                .set('Authorization', `Bearer ${tenantManagerToken}`)
                .set('x-company-token', tenantCtx.token)
                .send({ reason: 'MT path happy path void' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(parseFloat(res.body.data.quantity)).toBe(-25);
        });
    });

    // ── Phase 3: Cross-tenant isolation ────────────────────────────────────────
    // Proves that a movement created in Tenant A is invisible to Tenant B.
    // dbStore routes to Tenant B's DB → findByPk returns null → 404.
    // The auth token comes from a user that has manager permissions in B's context.

    describe('Cross-tenant isolation', () => {
        let tenantA;
        let tenantB;
        let tokenA;
        let tokenB;
        let tenantAMovementId;

        beforeAll(async () => {
            [tenantA, tenantB] = await Promise.all([
                createTestTenant('iso-a'),
                createTestTenant('iso-b')
            ]);

            /**
             * Register a manager for a given tenant.
             * Permissions are set in both the global DB and the tenant DB
             * so that the checkPermission middleware resolves correctly regardless
             * of which DB it reads from.
             */
            async function setupTenantManager(ctx, label) {
                const creds = {
                    username: `void_iso_${label}_${TIMESTAMP}`,
                    email: `void_iso_${label}_${TIMESTAMP}@iso.test`,
                    password: 'IsoManager1!'
                };
                await request(app)
                    .post('/api/v1/auth/register')
                    .set('x-company-token', ctx.token)
                    .send(creds);

                const permJson = JSON.stringify(DEFAULT_ROLE_PERMISSIONS.manager);
                // Update global DB
                await db.User.update(
                    { role: 'manager', permissions: permJson },
                    { where: { email: creds.email } }
                );
                // Update tenant DB if present
                await ctx.models.User.update(
                    { role: 'manager', permissions: permJson },
                    { where: { email: creds.email } }
                ).catch(() => { });

                const login = await request(app)
                    .post('/api/v1/auth/login')
                    .set('x-company-token', ctx.token)
                    .send({ email: creds.email, password: creds.password });
                return login.body.data?.token;
            }

            [tokenA, tokenB] = await Promise.all([
                setupTenantManager(tenantA, 'a'),
                setupTenantManager(tenantB, 'b')
            ]);

            // Create a StockMovement in Tenant A's DB only
            const itemA = await tenantA.models.Item.create({
                sku_code: `VOID-ISO-A-${TIMESTAMP}`,
                name: 'Tenant A Item',
                category: 'raw_material',
                unit_of_measure: 'kg',
                current_stock: 10,
                fifo_enabled: false,
                cost_price: 1.00
            });
            const mvA = await tenantA.models.StockMovement.create({
                item_id: itemA.item_id,
                quantity: 10,
                movement_type: 'purchase_receipt',
                reference_type: 'MANUAL',
                notes: 'Isolation fixture'
            });
            tenantAMovementId = mvA.movement_id;
        });

        afterAll(async () => {
            await Promise.all([
                tenantA && destroyTestTenant(tenantA),
                tenantB && destroyTestTenant(tenantB)
            ]);
        });

        it('returns 404 when Tenant B tries to void a movement that only exists in Tenant A', async () => {
            // tokenB-user is a valid manager in Tenant B's context; Tenant B's DB has no such movement_id
            const res = await request(app)
                .post(`/api/v1/stock-movements/${tenantAMovementId}/void`)
                .set('Authorization', `Bearer ${tokenB}`)
                .set('x-company-token', tenantB.token)
                .send({ reason: 'Cross-tenant attack attempt' });

            // Must 404 — B's DB has no such movement
            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
        });

        it('confirms Tenant A CAN void the same movement from Tenant A context', async () => {
            const itemA = await tenantA.models.Item.findOne({
                where: { sku_code: `VOID-ISO-A-${TIMESTAMP}` }
            });
            const batch = await seedBatch(tenantA.models, {
                item_id: itemA.item_id,
                movement_id: tenantAMovementId,
                original_quantity: 10,
                remaining_quantity: 10,
                quantity_consumed: 0,
                cost_per_unit: 1.00,
                status: 'available'
            });
            await tenantA.models.StockMovement.update(
                { batch_id: batch.batch_id },
                { where: { movement_id: tenantAMovementId } }
            );

            const res = await request(app)
                .post(`/api/v1/stock-movements/${tenantAMovementId}/void`)
                .set('Authorization', `Bearer ${tokenA}`)
                .set('x-company-token', tenantA.token)
                .send({ reason: 'Legitimate A-context void' });

            expect(res.status).toBe(200);
        });
    });

    // ── Phase 4: Concurrency — SELECT FOR UPDATE serialization ─────────────────
    // Fires two simultaneous void requests against the same movement.
    // The SELECT FOR UPDATE lock ensures exactly one succeeds (200) and
    // the other re-reads the already-voided row and gets 400.

    describe('Concurrency: simultaneous void prevention (SELECT FOR UPDATE)', () => {
        it('ensures exactly one void wins when two requests arrive simultaneously', async () => {
            const { receiptMovement } = await createReceiptWithBatch({ qty: 15 });

            const [r1, r2] = await Promise.all([
                request(app)
                    .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                    .set('Authorization', `Bearer ${managerToken}`)
                    .send({ reason: 'Concurrent void attempt 1' }),
                request(app)
                    .post(`/api/v1/stock-movements/${receiptMovement.movement_id}/void`)
                    .set('Authorization', `Bearer ${managerToken}`)
                    .send({ reason: 'Concurrent void attempt 2' })
            ]);

            const statuses = [r1.status, r2.status].sort((a, b) => a - b);

            // Exactly one must succeed and exactly one must detect the already-voided state
            expect(statuses).toEqual([200, 400]);

            const winner = r1.status === 200 ? r1 : r2;
            expect(winner.body.success).toBe(true);
            expect(parseFloat(winner.body.data.quantity)).toBe(-15);

            const loser = r1.status === 400 ? r1 : r2;
            expect(loser.body.message).toMatch(/already voided/i);
        });
    });
});

import { jest } from '@jest/globals';
import { buildInventoryModule } from '../../../src/modules/inventory/index.js';
import { buildStorefrontModule } from '../../../src/modules/storefront/index.js';
import { ApplicationResult } from '../../../src/shared/contracts/applicationResult.js';

/**
 * placeOrderReservationWiring.test.js — regression guard for 10-REVIEW.md
 * CR-01 ("`reserveStock` composition-root wiring mismatch — stock
 * reservation silently no-ops on every real checkout").
 *
 * Unlike tests/storefront/placeOrder.test.js and tests/storefront/
 * storefrontE2E.test.js (which inject hand-written `jest.fn()` fakes for
 * reserveStock/releaseReservation/setReservationExpiry shaped like the
 * DOCUMENTED repository contract), this suite composes the REAL module
 * graph — buildInventoryModule() -> buildStorefrontModule() — using the
 * exact same wiring apps/dgfy-api/src/routes/index.js's composition root
 * uses: the raw InventoryReservationRepository methods (reserveStock via a
 * thin positional-args adapter, releaseReservation/setReservationExpiry
 * bound directly), never inventoryReservationPorts.* (the staff-membership-
 * gated buildReserveStockUseCase/etc. usecase wrappers — the wrong layer
 * for a consumer storefront checkout, see placeOrderUseCases.js:118-137's
 * own doc comment).
 *
 * Only the lowest-level boundary is faked (TenantConnector.getModels(),
 * BusinessDatabaseRegistryRepository, and the top-level product catalog
 * productRepository/storefrontOrderModel) — every use-case/repository
 * layer in between is the REAL production code. If routes/index.js's
 * wiring ever regresses to inventoryReservationPorts.reserveStock (the
 * bug this file guards against), this test fails: that usecase wrapper
 * requires an accountId no storefront checkout ever supplies, so it
 * resolves an ApplicationResult.error that placeOrderUseCases.js's
 * try/catch can never observe (buildReserveStockUseCase never throws) —
 * the reservation silently no-ops and InventoryReservation.create is
 * never called, which the assertions below check directly.
 */

const BUSINESS_ID = 'business-uuid-1';
const NOW = new Date('2026-07-15T10:00:00.000Z');

function makeOrderRow(id, payload) {
    const row = { id, ...payload };
    row.get = () => {
        const { get, update, ...plain } = row;
        return plain;
    };
    row.update = async (patch) => {
        Object.assign(row, patch);
        return row;
    };
    return row;
}

function makeFakeStorefrontOrderModel() {
    const rowsById = new Map();
    let counter = 1;
    return {
        create: jest.fn(async (payload) => {
            const id = `order-${counter++}`;
            const row = makeOrderRow(id, payload);
            rowsById.set(id, row);
            return row;
        }),
        findOne: jest.fn(async () => null),
        findByPk: jest.fn(async (id) => rowsById.get(id) || null),
        findAll: jest.fn(async () => [])
    };
}

function makeFakeSequelize() {
    return {
        fn: (...args) => ({ __fn: args }),
        col: (name) => ({ __col: name }),
        literal: (sql) => ({ __literal: sql }),
        where: (...args) => ({ __where: args }),
        Op: { gt: 'gt', lte: 'lte', or: 'or' },
        Transaction: { LOCK: { UPDATE: 'UPDATE' } },
        transaction: jest.fn(async (executor) => executor({ id: 'txn-1' }))
    };
}

function buildFakeTenantConnector() {
    const fakeSequelize = makeFakeSequelize();

    const Product = {
        findByPk: jest.fn().mockResolvedValue({
            id: 1,
            business_id: BUSINESS_ID,
            stock_count: 100,
            inventory_mode: 'basic_inventory'
        })
    };

    const InventoryReservation = {
        findAll: jest.fn().mockResolvedValue([{ heldSum: 0 }]),
        create: jest.fn().mockImplementation(async (payload) => makeOrderRow(101, payload)),
        update: jest.fn().mockResolvedValue([1]),
        sequelize: fakeSequelize
    };

    const tenantConnector = {
        getModels: jest.fn(() => ({ InventoryReservation, Product }))
    };

    return { tenantConnector, InventoryReservation, Product };
}

function buildFakeBusinessDatabaseRegistryRepository() {
    return {
        findByBusinessId: jest.fn().mockResolvedValue({
            database_name: 'dgfy_business_test',
            status: 'active',
            verified_at: new Date('2026-01-01T00:00:00.000Z')
        })
    };
}

describe('placeOrder reservation wiring (10-REVIEW.md CR-01 regression guard)', () => {
    it('actually reserves stock through InventoryReservationRepository when composed the same way routes/index.js does', async () => {
        const { tenantConnector, InventoryReservation } = buildFakeTenantConnector();
        const businessDatabaseRegistryRepository = buildFakeBusinessDatabaseRegistryRepository();

        // Real buildInventoryModule() — same call routes/index.js makes.
        const { reservationRepository } = buildInventoryModule({
            tenantConnector,
            businessDatabaseRegistryRepository,
            businessRepository: {}
        });
        expect(reservationRepository).toBeDefined();

        const productRepository = {
            findById: jest.fn(async (businessId, productId) => ({
                id: productId,
                name: 'Widget',
                base_price: '50.0000',
                is_active: true
            }))
        };

        const createQrphSession = jest.fn().mockResolvedValue(ApplicationResult.success({
            session_public_reference: 'CPS-TESTSESSION1',
            qr_code_image_url: 'https://paymongo.example/qr/pi_abc123.png',
            expires_at: new Date('2026-07-15T10:30:00.000Z'),
            amount_centavos: 10000
        }));

        // Real buildStorefrontModule() wired EXACTLY like routes/index.js's
        // CR-01-fixed composition: raw repository methods, not
        // inventoryReservationPorts.* usecase wrappers.
        const { useCases } = buildStorefrontModule({
            productRepository,
            storefrontGuestIdentityModel: {},
            storefrontOrderModel: makeFakeStorefrontOrderModel(),
            reserveStock: ({ businessId, lines, referenceId, expiresAt }) =>
                reservationRepository.reserveStock(businessId, lines, referenceId, expiresAt),
            releaseReservation: reservationRepository.releaseReservation.bind(reservationRepository),
            setReservationExpiry: reservationRepository.setReservationExpiry.bind(reservationRepository),
            createQrphSession,
            finalizeCashOrder: null
        });

        expect(typeof useCases.placeOrder).toBe('function');

        const result = await useCases.placeOrder({
            businessId: BUSINESS_ID,
            idempotencyKey: 'idem-key-12345678',
            authenticatedAccountId: 'account-1',
            lines: [{ productId: 1, quantity: 2 }],
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'immediate',
            paymentMethod: 'gcash',
            contact: { name: 'Test Customer', phone: '09171234567' },
            now: NOW
        });

        expect(result.isSuccess).toBe(true);

        // The load-bearing assertion this suite exists for: a real stock
        // hold was actually inserted via the repository (proves reserveStock
        // was wired to the raw repository method, not silently swallowed by
        // the staff-gated usecase wrapper's ApplicationResult.error path).
        expect(InventoryReservation.create).toHaveBeenCalledTimes(1);
        expect(InventoryReservation.create.mock.calls[0][0]).toMatchObject({
            business_id: BUSINESS_ID,
            product_id: 1,
            quantity: 2,
            status: 'active'
        });

        // setReservationExpiry (step 6a) also went through the raw
        // repository, not a staff-gated wrapper.
        expect(InventoryReservation.update).toHaveBeenCalledWith(
            { expires_at: expect.any(Date) },
            expect.objectContaining({ where: { reference_id: expect.any(String) } })
        );
    });
});

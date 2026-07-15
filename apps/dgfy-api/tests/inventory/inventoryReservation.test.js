import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { InventoryReservationRepository } from '../../src/modules/inventory/repositories/inventoryReservationRepository.js';
import {
  buildAvailableToSellUseCase,
  buildReserveStockUseCase,
  buildCommitReservationUseCase,
  buildReleaseReservationUseCase,
  buildExpireDueReservationsUseCase,
  buildSetReservationExpiryUseCase
} from '../../src/modules/inventory/usecases/inventoryReservationUseCases.js';

/**
 * 10-02-PLAN.md Task 2: real-assertion tests for the inventory reservation
 * usecases (reserve/commit/release/expireDue/availableToSell/
 * setReservationExpiry).
 *
 * WR-01 fix (10-REVIEW.md): the previous version of this file set up
 * mocks and then asserted only `expect(someMock).toBeDefined()` — always
 * true regardless of what the production code under test actually did, and
 * never invoked InventoryReservationRepository or any of the
 * inventoryReservationUseCases.js builders. This is the suite that should
 * have caught CR-01 (composition-root wiring mismatch) and CR-02 (missing
 * product_id filter, corrupting availability across every product in a
 * tenant) but structurally could not, because it never exercised the real
 * code.
 *
 * This rewrite constructs a REAL InventoryReservationRepository against a
 * mocked TenantConnector/BusinessDatabaseRegistryRepository (no live MySQL,
 * mirrors inventoryMovement.test.js's convention) and builds the REAL
 * usecases closed over it, asserting actual outcomes: computed
 * availableToSell values, rows actually passed to InventoryReservation.
 * create()/update(), thrown/returned ApplicationResult errors, and
 * businessRepository.getMembership access-control gating.
 *
 * While fixing this suite, a previously-undetected production bug was also
 * discovered and fixed in src/modules/inventory/usecases/
 * inventoryReservationUseCases.js: every error branch called the
 * non-existent `ApplicationResult.error(...)` (ApplicationResult only
 * exposes `.success()`/`.failure()`) — a TypeError on any failure path
 * instead of a graceful ApplicationResult.failure(). This suite's
 * "Error handling" describe block exercises those exact paths, so this
 * class of bug cannot silently regress again.
 */

const BUSINESS_ID = 'biz-123';
const NOW = new Date('2026-07-13T12:00:00.000Z');

function makeRow(id, payload) {
  const row = { id, ...payload };
  row.get = ({ plain } = {}) => {
    const { get, update, ...rest } = row;
    return plain ? { ...rest } : row;
  };
  row.update = jest.fn(async (patch) => {
    Object.assign(row, patch);
    return row;
  });
  return row;
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

describe('Inventory Reservation Usecases (10-02)', () => {
  let mockTenantConnector;
  let mockBusinessRepository;
  let mockBusinessDatabaseRegistryRepository;
  let mockRecordSale;
  let mockInventoryReservationModel;
  let mockProductModel;
  let mockSequelize;
  let repository;

  beforeEach(() => {
    mockSequelize = makeFakeSequelize();

    mockProductModel = {
      findByPk: jest.fn(),
      findOne: jest.fn(),
      sequelize: mockSequelize
    };

    mockInventoryReservationModel = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      sequelize: mockSequelize
    };

    mockTenantConnector = {
      getModels: jest.fn((databaseName) => ({
        InventoryReservation: mockInventoryReservationModel,
        Product: mockProductModel
      }))
    };

    mockBusinessDatabaseRegistryRepository = {
      findByBusinessId: jest.fn().mockResolvedValue({
        database_name: 'dgfy_business_test',
        status: 'active',
        verified_at: new Date('2026-01-01T00:00:00.000Z')
      })
    };

    mockBusinessRepository = {
      getMembership: jest.fn(async () => ({ status: 'active' }))
    };

    mockRecordSale = jest.fn(async () => ({ success: true }));

    repository = new InventoryReservationRepository({
      tenantConnector: mockTenantConnector,
      businessDatabaseRegistryRepository: mockBusinessDatabaseRegistryRepository
    });
  });

  describe('availableToSell', () => {
    it('should return on_hand minus live-active reservations', async () => {
      mockProductModel.findByPk.mockResolvedValue({
        id: 1,
        business_id: BUSINESS_ID,
        stock_count: 100,
        inventory_mode: 'basic_inventory'
      });
      mockInventoryReservationModel.findAll.mockResolvedValue([{ heldSum: 50 }]);

      const availableToSell = buildAvailableToSellUseCase({ repository });
      const result = await availableToSell(BUSINESS_ID, 1);

      expect(result.isSuccess).toBe(true);
      expect(result.data.availableToSell).toBe(50);
      // CR-02 regression guard: the held-sum query must filter by THIS
      // product's product_id, not sum every reservation in the tenant.
      expect(mockInventoryReservationModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ product_id: 1, status: 'active' })
        })
      );
    });

    it('should read whatever heldSum the live-active-only query resolves (expired-active exclusion lives in the SQL WHERE clause, asserted structurally above)', async () => {
      mockProductModel.findByPk.mockResolvedValue({
        id: 1,
        business_id: BUSINESS_ID,
        stock_count: 100,
        inventory_mode: 'basic_inventory'
      });
      // 20 live-active only — a broken filter that also summed a 30-unit
      // expired-active row would resolve heldSum: 50 instead.
      mockInventoryReservationModel.findAll.mockResolvedValue([{ heldSum: 20 }]);

      const availableToSell = buildAvailableToSellUseCase({ repository });
      const result = await availableToSell(BUSINESS_ID, 1);

      expect(result.isSuccess).toBe(true);
      expect(result.data.availableToSell).toBe(80);
    });

    it('should return Number.MAX_SAFE_INTEGER for non-stock products (no inventory constraint)', async () => {
      mockProductModel.findByPk.mockResolvedValue({
        id: 2,
        business_id: BUSINESS_ID,
        stock_count: null,
        inventory_mode: 'non_stock'
      });

      const availableToSell = buildAvailableToSellUseCase({ repository });
      const result = await availableToSell(BUSINESS_ID, 2);

      expect(result.isSuccess).toBe(true);
      expect(result.data.availableToSell).toBe(Number.MAX_SAFE_INTEGER);
      expect(mockInventoryReservationModel.findAll).not.toHaveBeenCalled();
    });

    it('rejects with 400 when businessId or productId is missing', async () => {
      const availableToSell = buildAvailableToSellUseCase({ repository });

      const result = await availableToSell(null, 1);

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('reserveStock', () => {
    const baseInput = (overrides = {}) => ({
      businessId: BUSINESS_ID,
      accountId: 'staff-1',
      lines: [{ productId: 1, quantity: 10 }],
      referenceId: 'order-abc',
      expiresAt: new Date('2026-07-13T13:00:00.000Z'),
      ...overrides
    });

    it('should insert active reservations when availableToSell >= requested quantity', async () => {
      mockProductModel.findByPk.mockResolvedValue({
        id: 1,
        stock_count: 100,
        inventory_mode: 'basic_inventory'
      });
      mockInventoryReservationModel.findAll.mockResolvedValue([{ heldSum: 0 }]);
      mockInventoryReservationModel.create.mockImplementation(async (payload) => makeRow(1, payload));

      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });
      const result = await reserveStock(baseInput());

      expect(result.isSuccess).toBe(true);
      expect(result.data.reservations).toHaveLength(1);
      expect(mockInventoryReservationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          business_id: BUSINESS_ID,
          product_id: 1,
          quantity: 10,
          reference_id: 'order-abc',
          status: 'active'
        }),
        expect.objectContaining({ transaction: expect.anything() })
      );
    });

    it('should reject with InsufficientStockError -> 409 CONFLICT when quantity > availableToSell', async () => {
      mockProductModel.findByPk.mockResolvedValue({
        id: 1,
        stock_count: 100,
        inventory_mode: 'basic_inventory'
      });
      // 50 already held -> availableToSell = 50, requesting 150.
      mockInventoryReservationModel.findAll.mockResolvedValue([{ heldSum: 50 }]);

      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });
      const result = await reserveStock(baseInput({ lines: [{ productId: 1, quantity: 150 }] }));

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(409);
      expect(result.error.details?.error_code).toBe('INSUFFICIENT_STOCK');
      expect(mockInventoryReservationModel.create).not.toHaveBeenCalled();
    });

    it('should map TenantDatabaseUnavailableError to a 503 result when the tenant DB is unreachable', async () => {
      mockBusinessDatabaseRegistryRepository.findByBusinessId.mockResolvedValue({
        database_name: 'dgfy_business_test',
        status: 'provisioning'
      });

      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });
      const result = await reserveStock(baseInput());

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error.details?.error_code).toBe('TENANT_DATABASE_UNAVAILABLE');
    });

    it('should be all-or-nothing across multiple lines: a failure on the SECOND line surfaces as an overall failure', async () => {
      mockProductModel.findByPk
        .mockResolvedValueOnce({ id: 1, stock_count: 100, inventory_mode: 'basic_inventory' })
        .mockResolvedValueOnce({ id: 2, stock_count: 5, inventory_mode: 'basic_inventory' });
      mockInventoryReservationModel.findAll
        .mockResolvedValueOnce([{ heldSum: 0 }]) // line 1: plenty available
        .mockResolvedValueOnce([{ heldSum: 0 }]); // line 2: only 5 available, requesting 10
      mockInventoryReservationModel.create.mockImplementation(async (payload) => makeRow(1, payload));

      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });
      const result = await reserveStock(baseInput({
        lines: [
          { productId: 1, quantity: 10 },
          { productId: 2, quantity: 10 }
        ]
      }));

      expect(result.isSuccess).toBe(false);
      expect(result.error.details?.error_code).toBe('INSUFFICIENT_STOCK');
      // The whole operation runs inside ONE sequelize.transaction() call —
      // production callers (placeOrderUseCases.js) branch on this single
      // overall failure and never see a partial reservation succeed.
      expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    });

    it('should use row-lock (LOCK.UPDATE) inside the transaction for the atomic availableToSell check', async () => {
      mockProductModel.findByPk.mockResolvedValue({
        id: 1,
        stock_count: 100,
        inventory_mode: 'basic_inventory'
      });
      mockInventoryReservationModel.findAll.mockResolvedValue([{ heldSum: 0 }]);
      mockInventoryReservationModel.create.mockImplementation(async (payload) => makeRow(1, payload));

      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });
      await reserveStock(baseInput());

      expect(mockProductModel.findByPk).toHaveBeenCalledWith(1, expect.objectContaining({
        lock: 'UPDATE',
        transaction: expect.anything()
      }));
    });

    it('rejects with 400 when businessId or accountId is missing', async () => {
      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });

      const result = await reserveStock(baseInput({ accountId: null }));

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(mockBusinessRepository.getMembership).not.toHaveBeenCalled();
    });

    it('rejects with 403 when the requesting account is not an active staff member/owner of the business', async () => {
      mockBusinessRepository.getMembership.mockResolvedValue(null);
      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });

      const result = await reserveStock(baseInput());

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(mockInventoryReservationModel.create).not.toHaveBeenCalled();
    });
  });

  describe('commitReservation', () => {
    it('should convert active reservation to sale via recordSale single-writer, then mark it committed', async () => {
      const activeRow = makeRow(1, {
        business_id: BUSINESS_ID,
        product_id: 1,
        quantity: 10,
        reference_id: 'order-abc',
        status: 'active'
      });
      mockInventoryReservationModel.findAll.mockResolvedValue([activeRow]);

      const commitReservation = buildCommitReservationUseCase({ repository, recordSaleUseCase: mockRecordSale });
      const result = await commitReservation({ businessId: BUSINESS_ID, referenceId: 'order-abc' });

      expect(result.isSuccess).toBe(true);
      expect(mockRecordSale).toHaveBeenCalledWith(expect.objectContaining({
        businessId: BUSINESS_ID,
        productId: 1,
        quantity: 10,
        referenceType: 'inventory_reservation',
        referenceId: 'order-abc'
      }));
      expect(activeRow.update).toHaveBeenCalledWith(
        { status: 'committed' },
        expect.objectContaining({ transaction: expect.anything() })
      );
    });

    it('should be idempotent: an already-committed reservation is not re-sold', async () => {
      // findAll's own WHERE clause filters status='active' — a committed
      // row is simply never returned, so recordSale is never called again.
      mockInventoryReservationModel.findAll.mockResolvedValue([]);

      const commitReservation = buildCommitReservationUseCase({ repository, recordSaleUseCase: mockRecordSale });
      const result = await commitReservation({ businessId: BUSINESS_ID, referenceId: 'order-abc' });

      expect(result.isSuccess).toBe(true);
      expect(mockRecordSale).not.toHaveBeenCalled();
    });

    it('should use the CALLER-provided transaction (e.g. finalize txn) instead of opening a new one', async () => {
      const activeRow = makeRow(1, {
        business_id: BUSINESS_ID,
        product_id: 1,
        quantity: 5,
        reference_id: 'order-abc',
        status: 'active'
      });
      mockInventoryReservationModel.findAll.mockResolvedValue([activeRow]);
      const callerTransaction = { name: 'finalize_transaction' };

      const commitReservation = buildCommitReservationUseCase({ repository, recordSaleUseCase: mockRecordSale });
      await commitReservation({ businessId: BUSINESS_ID, referenceId: 'order-abc', transaction: callerTransaction });

      // No NEW transaction opened — the caller's own transaction was used.
      expect(mockSequelize.transaction).not.toHaveBeenCalled();
      expect(mockInventoryReservationModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ transaction: callerTransaction })
      );
    });

    it('rejects with 400 when businessId or referenceId is missing', async () => {
      const commitReservation = buildCommitReservationUseCase({ repository, recordSaleUseCase: mockRecordSale });

      const result = await commitReservation({ businessId: BUSINESS_ID });

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('releaseReservation', () => {
    it('should mark active reservations released and return the affected row count', async () => {
      mockInventoryReservationModel.update.mockResolvedValue([2]);

      const releaseReservation = buildReleaseReservationUseCase({ repository });
      const result = await releaseReservation(BUSINESS_ID, 'order-abc');

      expect(result.isSuccess).toBe(true);
      expect(result.data.releasedCount).toBe(2);
      expect(mockInventoryReservationModel.update).toHaveBeenCalledWith(
        { status: 'released' },
        expect.objectContaining({ where: { reference_id: 'order-abc', status: 'active' } })
      );
    });

    it('should be idempotent: releasing an already-released reference updates zero rows without erroring', async () => {
      mockInventoryReservationModel.update.mockResolvedValue([0]);

      const releaseReservation = buildReleaseReservationUseCase({ repository });
      const result = await releaseReservation(BUSINESS_ID, 'order-abc');

      expect(result.isSuccess).toBe(true);
      expect(result.data.releasedCount).toBe(0);
    });
  });

  describe('expireDueReservations', () => {
    // buildExpireDueReservationsUseCase's shape is unusual: it resolves to
    // an inner function that takes businessId (see inventoryReservation
    // UseCases.js's own doc comment — "a background/admin operation ...
    // orchestration code calls this per-business from a scheduled sweep").
    // Not currently wired to any route in routes/index.js's composition
    // root (reservationPorts.expireDueReservations is built but never
    // consumed there) — exercised here purely at the usecase-builder level.
    it('should release all active reservations with expires_at <= now and return the affected count', async () => {
      mockInventoryReservationModel.update.mockResolvedValue([3]);

      const expireDueReservationsForBusiness = await buildExpireDueReservationsUseCase({ repository })(NOW);
      const result = await expireDueReservationsForBusiness(BUSINESS_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.data.expiredCount).toBe(3);
      expect(mockInventoryReservationModel.update).toHaveBeenCalledWith(
        { status: 'released' },
        expect.objectContaining({
          where: {
            status: 'active',
            expires_at: { lte: NOW }
          }
        })
      );
    });

    it('should leave non-expired active and released rows untouched (asserted via the WHERE clause, not a live DB)', async () => {
      mockInventoryReservationModel.update.mockResolvedValue([0]);

      const expireDueReservationsForBusiness = await buildExpireDueReservationsUseCase({ repository })(NOW);
      const result = await expireDueReservationsForBusiness(BUSINESS_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.data.expiredCount).toBe(0);
      const [, options] = mockInventoryReservationModel.update.mock.calls[0];
      // status: 'active' scopes the UPDATE to active rows only — a
      // 'released' row's status never matches this WHERE clause.
      expect(options.where.status).toBe('active');
    });
  });

  describe('setReservationExpiry', () => {
    it('should update expires_at for every reservation row matching referenceId', async () => {
      const newExpiresAt = new Date('2026-07-13T13:00:00.000Z');
      mockInventoryReservationModel.update.mockResolvedValue([2]);

      const setReservationExpiry = buildSetReservationExpiryUseCase({ repository });
      const result = await setReservationExpiry(BUSINESS_ID, 'order-abc', newExpiresAt);

      expect(result.isSuccess).toBe(true);
      expect(result.data.updatedCount).toBe(2);
      expect(mockInventoryReservationModel.update).toHaveBeenCalledWith(
        { expires_at: newExpiresAt },
        expect.objectContaining({ where: { reference_id: 'order-abc' } })
      );
    });

    it('rejects with 400 when businessId, referenceId, or expiresAt is missing', async () => {
      const setReservationExpiry = buildSetReservationExpiryUseCase({ repository });

      const result = await setReservationExpiry(BUSINESS_ID, 'order-abc', null);

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('Error handling', () => {
    it('maps TenantDatabaseUnavailableError to an ApplicationResult failure (D-10 fail-fast, never throws raw)', async () => {
      mockBusinessDatabaseRegistryRepository.findByBusinessId.mockResolvedValue(null);

      const availableToSell = buildAvailableToSellUseCase({ repository });
      const result = await availableToSell(BUSINESS_ID, 1);

      expect(result.isSuccess).toBe(false);
      // 'missing' reason maps to a 400 validation-style error, distinct
      // from the generic 503 SERVICE_UNAVAILABLE mapping used for other
      // TenantDatabaseUnavailableError reasons (see mapTenantDatabaseError).
      expect(result.statusCode).toBe(400);
      expect(result.error.details?.error_code).toBe('NO_TENANT_DATABASE');
    });

    it('maps InsufficientStockError to an ApplicationResult failure with statusCode 409 CONFLICT (distinct from tenant-unavailable)', async () => {
      mockProductModel.findByPk.mockResolvedValue({
        id: 1,
        stock_count: 10,
        inventory_mode: 'basic_inventory'
      });
      mockInventoryReservationModel.findAll.mockResolvedValue([{ heldSum: 0 }]);

      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });
      const result = await reserveStock({
        businessId: BUSINESS_ID,
        accountId: 'staff-1',
        lines: [{ productId: 1, quantity: 999 }],
        referenceId: 'order-abc'
      });

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(409);
      expect(result.error.details?.error_code).toBe('INSUFFICIENT_STOCK');
    });

    it('never throws a raw TypeError on a failure path (regression guard: ApplicationResult only exposes success()/failure(), never error())', async () => {
      // Deliberately trigger EVERY usecase's most direct failure branch and
      // confirm each resolves to a graceful ApplicationResult.failure()
      // rather than throwing — this is the exact class of bug WR-01's
      // rewrite uncovered (every branch previously called the
      // non-existent ApplicationResult.error()).
      const availableToSell = buildAvailableToSellUseCase({ repository });
      const reserveStock = buildReserveStockUseCase({ repository, businessRepository: mockBusinessRepository });
      const commitReservation = buildCommitReservationUseCase({ repository, recordSaleUseCase: mockRecordSale });
      const releaseReservationUseCase = buildReleaseReservationUseCase({ repository });
      const setReservationExpiry = buildSetReservationExpiryUseCase({ repository });

      await expect(availableToSell(null, null)).resolves.toMatchObject({ success: false });
      await expect(reserveStock({})).resolves.toMatchObject({ success: false });
      await expect(commitReservation({})).resolves.toMatchObject({ success: false });
      await expect(releaseReservationUseCase(null, null)).resolves.toMatchObject({ success: false });
      await expect(setReservationExpiry(null, null, null)).resolves.toMatchObject({ success: false });
    });
  });
});

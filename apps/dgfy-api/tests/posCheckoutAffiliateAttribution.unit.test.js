// Phase 220 (#1199): POS in-store checkout — re-verify affiliate enrollment at commit time,
// mirroring Phase 206's storefront twin (#450 D2, tests/storeCheckoutAffiliatePricing.unit.test.js).
//
// dgfyAffiliateRepository.js is a hard import inside both posUseCases.js and
// affiliateCommissionAccrual.js (not dependency-injected), so it's mocked at the module level via
// jest.unstable_mockModule before posUseCases.js is dynamically imported. Because ESM module
// resolution is cached, both files receive the identical mocked instance, so mocking it once here
// cascades correctly through resolveActiveAffiliateEnrollment,
// resolveActiveAffiliateEnrollmentById, and accrueEarnedForInStoreSale without needing to touch
// those modules directly - the real resolvers and the real accrual logic run, only the DB boundary
// is faked.
//
// The `buildCheckoutPosUseCase` / `dbStore.run` scaffolding below mirrors
// tests/posCheckoutFnbContracts.usecase.test.js, the proven zero-DB harness for this use case - not
// invented here.

import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
// Safe to import statically alongside the jest.unstable_mockModule calls below: posValidator.js
// has no mocked dependency (only `joi` and orderMethods.js), so it is unaffected by them.
import { validatePosCheckout } from '../src/validators/posValidator.js';

const TENANT_ID = 'tenant-pos-affiliate-attribution';
const ENROLLMENT_ID = 701;

const mockGetAllSettingsUseCase = jest.fn(async () => ({
    success: true,
    data: {
        fnb_restaurant_service_charge: {
            value: JSON.stringify({ enabled: false, label: 'Restaurant service charge', rate: 0, taxable: true })
        }
    }
}));

const mockAssertComplianceOperationAllowed = jest.fn(async () => ({
    success: true,
    data: {
        decision: { allowed: true },
        receipt_contract: {
            document_type: 'non_fiscal_slip',
            label: 'NON-FISCAL SLIP',
            document_context: 'non_fiscal'
        }
    }
}));

const mockResolveMovementLocation = jest.fn(async ({ requestedLocationId }) => ({
    location_id: requestedLocationId || 3,
    name: 'Main'
}));
const mockResolveIdentityStatus = jest.fn(async () => ({
    identity_mode: 'dgfy_membership',
    membership_id: 44
}));

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
    getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    assertComplianceOperationAllowed: mockAssertComplianceOperationAllowed,
    COMPLIANCE_OPERATION: {
        POS_CHECKOUT: 'pos.checkout',
        POS_TERMINAL_OPERATION: 'pos.terminal.operation'
    }
}));

jest.unstable_mockModule('../src/modules/inventory/index.js', () => ({
    resolveMovementLocation: mockResolveMovementLocation
}));

jest.unstable_mockModule('../src/services/locationInventoryService.js', () => ({
    isMultiLocationInventoryEnabled: jest.fn(async () => true),
    listActiveLocations: jest.fn(async () => []),
    resolveDefaultActiveLocation: jest.fn(async () => ({ location_id: 3, name: 'Main' })),
    assertLocationAccess: jest.fn(async () => true),
    resolveMovementLocation: mockResolveMovementLocation,
    resolveTransferLocations: jest.fn(async ({ sourceLocationId, destinationLocationId }) => ({
        sourceLocation: { location_id: sourceLocationId || 3, name: 'Source' },
        destinationLocation: { location_id: destinationLocationId || 4, name: 'Destination' }
    }))
}));

const defaultAffiliateSettings = () => ({
    program_enabled: true,
    default_rate_bps: 500,
    commission_type: 'PERCENTAGE_OF_BASE',
    settlement_policy: null,
    commission_base_mode: 'discounted_subtotal',
    category_rates_enabled: false
});

const activeEnrollment = (overrides = {}) => ({
    enrollment_id: ENROLLMENT_ID,
    dgfy_account_id: 'affiliate-acct',
    tenant_id: TENANT_ID,
    status: 'active',
    commission_rate_bps: null,
    commission_type: null,
    ...overrides
});

const mockAffiliateRepo = {
    getSettings: jest.fn(),
    findActiveEnrollmentByShareCode: jest.fn(),
    findEnrollmentById: jest.fn(),
    recordAttribution: jest.fn().mockResolvedValue({}),
    createEarnedCommissionIfMissing: jest.fn(),
    listActiveCategoryRatesForEnrollment: jest.fn().mockResolvedValue([]),
    sumLifetimeCommissionCentavos: jest.fn().mockResolvedValue(0)
};

jest.unstable_mockModule('../src/modules/dgfy/repositories/dgfyAffiliateRepository.js', () => ({
    dgfyAffiliateRepository: mockAffiliateRepo,
    default: mockAffiliateRepo
}));

const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

jest.unstable_mockModule('../src/config/logger.js', () => ({ default: loggerMock }));

let buildCheckoutPosUseCase;

beforeAll(async () => {
    ({ buildCheckoutPosUseCase } = await import('../src/modules/pos/usecases/posUseCases.js'));
});

const buildCheckoutContractUseCase = (dependencies) => buildCheckoutPosUseCase({
    ...dependencies,
    resolveIdentityStatus: mockResolveIdentityStatus
});

const createTransaction = () => {
    const transaction = {
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => {
            transaction.finished = true;
        }),
        rollback: jest.fn(async () => {
            transaction.finished = true;
        })
    };
    return transaction;
};

const runInTenantContext = async (callback) => {
    const transaction = createTransaction();
    const sequelize = {
        transaction: jest.fn().mockResolvedValue(transaction)
    };
    return dbStore.run({
        tenantId: TENANT_ID,
        tenantComplianceModeState: 'non_compliant_active',
        tenantComplianceModeChoiceRequired: false,
        tenantComplianceProfile: {},
        sequelize
    }, async () => callback({ sequelize, transaction }));
};

const terminalIdentityPolicy = () => ({
    mode: 'warn',
    active_registry: [{ terminal_id: 'TERM-01', label: 'Term 01', is_active: true, location_id: 3 }]
});

const createOpenShift = () => ({
    pos_terminal_shift_id: 901,
    cashier_id: 12,
    terminal_id: 'TERM-01',
    location_id: 3,
    status: 'open',
    opened_at: '2026-06-17T08:00:00.000Z',
    business_date: '2026-06-17',
    opening_float_amount: 100
});

// Minimal, self-contained fake posRepository - a single PHP 100 item, no discount, no F&B service
// charge - mirroring the successful zero-DB checkout fixture already established in
// tests/posCheckoutFnbContracts.usecase.test.js.
const buildFakePosRepository = ({ createdTransactionId = 601 } = {}) => {
    let createdTransaction = null;
    return {
        getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue(terminalIdentityPolicy()),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        findSellableItemsByIds: jest.fn().mockResolvedValue([{
            item_id: 1,
            name: 'Widget',
            category: 'product',
            unit_of_measure: 'pc',
            current_stock: 100,
            cost_per_unit: 10,
            default_sale_price: 100,
            vat_type: 'vatable',
            pos_always_available: true
        }]),
        listProductCompositionsForItems: jest.fn().mockResolvedValue([]),
        findOpenTerminalShift: jest.fn().mockResolvedValue(createOpenShift()),
        getTerminalShiftById: jest.fn(),
        nextInvoiceNumber: jest.fn().mockResolvedValue('NFS-AFF-001'),
        getFnbTableById: jest.fn(),
        createTransactionWithLines: jest.fn(async ({ header, lines }) => {
            createdTransaction = { pos_transaction_id: createdTransactionId, ...header, lines };
            return createdTransactionId;
        }),
        createFnbServiceChargeSnapshot: jest.fn(),
        settleFnbCheck: jest.fn(),
        incrementPersistentCounter: jest.fn().mockResolvedValue(1),
        getTransactionById: jest.fn(async () => createdTransaction)
    };
};

const basePayload = (overrides = {}) => ({
    idempotency_key: `aff-checkout-${Math.floor(Math.random() * 1e9)}`,
    terminal_id: 'TERM-01',
    location_id: 3,
    document_context: 'non_fiscal',
    payment_type: 'cash',
    order_method: 'pickup',
    lines: [{ item_id: 1, quantity: 1 }],
    ...overrides
});

beforeEach(() => {
    jest.clearAllMocks();
    mockAffiliateRepo.getSettings.mockResolvedValue(defaultAffiliateSettings());
    mockAffiliateRepo.findActiveEnrollmentByShareCode.mockResolvedValue(activeEnrollment());
    mockAffiliateRepo.findEnrollmentById.mockResolvedValue(activeEnrollment());
    mockAffiliateRepo.createEarnedCommissionIfMissing.mockResolvedValue({
        commission: { commission_id: 1, status: 'earned' }
    });
});

describe('POS checkout — #1199 (Phase 220): enrollment re-verified at commit time', () => {
    // T1
    test('still active at commit: commission accrues, findActiveEnrollmentByShareCode and findEnrollmentById each called exactly once', async () => {
        const posRepository = buildFakePosRepository();
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: basePayload({ affiliate_code: 'AFF-CODE' })
        }));

        expect(result.success).toBe(true);
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing).toHaveBeenCalledTimes(1);
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing.mock.calls[0][0].enrollmentId)
            .toBe(ENROLLMENT_ID);
        // The assertion that actually pins the new behavior - once at entry (by code), once at the
        // commit-time re-check (by id). Without the second call count, this test would also pass
        // against pre-Phase-220 code.
        expect(mockAffiliateRepo.findActiveEnrollmentByShareCode).toHaveBeenCalledTimes(1);
        expect(mockAffiliateRepo.findEnrollmentById).toHaveBeenCalledTimes(1);
        expect(loggerMock.warn).not.toHaveBeenCalledWith(
            '[PosUseCases] Affiliate attribution dropped: enrollment inactive at commit',
            expect.anything()
        );
    });

    // T2
    test('revoked between entry and commit: sale still succeeds, no commission, drop warn fires once', async () => {
        mockAffiliateRepo.findEnrollmentById.mockResolvedValue(activeEnrollment({ status: 'revoked' }));

        const posRepository = buildFakePosRepository();
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: basePayload({ affiliate_code: 'AFF-CODE' })
        }));

        expect(result.success).toBe(true);
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing).not.toHaveBeenCalled();
        expect(mockAffiliateRepo.recordAttribution).not.toHaveBeenCalled();
        expect(loggerMock.warn).toHaveBeenCalledWith(
            '[PosUseCases] Affiliate attribution dropped: enrollment inactive at commit',
            expect.objectContaining({ tenantId: TENANT_ID, enrollment_id: ENROLLMENT_ID })
        );
        expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    });

    // T3
    test('suspended between entry and commit: same drop as revoked (status === "active" gate, not !== "revoked")', async () => {
        mockAffiliateRepo.findEnrollmentById.mockResolvedValue(activeEnrollment({ status: 'suspended' }));

        const posRepository = buildFakePosRepository();
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: basePayload({ affiliate_code: 'AFF-CODE' })
        }));

        expect(result.success).toBe(true);
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing).not.toHaveBeenCalled();
        expect(mockAffiliateRepo.recordAttribution).not.toHaveBeenCalled();
        expect(loggerMock.warn).toHaveBeenCalledWith(
            '[PosUseCases] Affiliate attribution dropped: enrollment inactive at commit',
            expect.objectContaining({ tenantId: TENANT_ID, enrollment_id: ENROLLMENT_ID })
        );
    });

    // T4
    test('program disabled between entry and commit: sale succeeds, no commission accrues', async () => {
        // getSettings is read at entry resolve, at the commit-time re-check, AND inside the accrual
        // itself (accrueEarnedForInStoreSale) - but the accrual is never reached once the re-check
        // returns null, so only the first two reads matter here (Phase 206's exact ordering trick).
        mockAffiliateRepo.getSettings
            .mockResolvedValueOnce(defaultAffiliateSettings())                          // entry-time
            .mockResolvedValue({ ...defaultAffiliateSettings(), program_enabled: false }); // commit-time onward

        const posRepository = buildFakePosRepository();
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: basePayload({ affiliate_code: 'AFF-CODE' })
        }));

        expect(result.success).toBe(true);
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing).not.toHaveBeenCalled();
        expect(loggerMock.warn).toHaveBeenCalledWith(
            '[PosUseCases] Affiliate attribution dropped: enrollment inactive at commit',
            expect.objectContaining({ tenantId: TENANT_ID, enrollment_id: ENROLLMENT_ID })
        );
    });

    // T5 — regression baseline
    test('no affiliate_code on the payload: neither lookup is called, no drop warn, sale succeeds', async () => {
        const posRepository = buildFakePosRepository();
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: basePayload()
        }));

        expect(result.success).toBe(true);
        expect(mockAffiliateRepo.findActiveEnrollmentByShareCode).not.toHaveBeenCalled();
        expect(mockAffiliateRepo.findEnrollmentById).not.toHaveBeenCalled();
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing).not.toHaveBeenCalled();
        expect(loggerMock.warn).not.toHaveBeenCalledWith(
            '[PosUseCases] Affiliate attribution dropped: enrollment inactive at commit',
            expect.anything()
        );
    });

    // T6 — regression baseline: the entry-time 422 gate must stay unaffected by the commit-time check
    test('invalid code at entry: still hard-rejects 422, findEnrollmentById never called, transaction rolled back', async () => {
        mockAffiliateRepo.findActiveEnrollmentByShareCode.mockResolvedValue(null);

        const posRepository = buildFakePosRepository();
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        let capturedTransaction = null;
        const result = await runInTenantContext(({ transaction }) => {
            capturedTransaction = transaction;
            return useCase({
                userId: 12,
                user: { user_id: 12, permissions: [] },
                payload: basePayload({ affiliate_code: 'BOGUS-CODE' })
            });
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('AFFILIATE_CODE_INVALID');
        expect(mockAffiliateRepo.findEnrollmentById).not.toHaveBeenCalled();
        expect(posRepository.createTransactionWithLines).not.toHaveBeenCalled();
        expect(capturedTransaction.rollback).toHaveBeenCalled();
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing).not.toHaveBeenCalled();
    });

    // T7 — the sale itself is unaffected by a drop (F2: POS affiliate codes never touch price)
    test('a drop leaves the sale identical to the accrued case — same totals, complete transaction', async () => {
        const activeRepo = buildFakePosRepository({ createdTransactionId: 611 });
        const activeUseCase = buildCheckoutContractUseCase({
            posRepository: activeRepo,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });
        const activeResult = await runInTenantContext(() => activeUseCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: basePayload({ affiliate_code: 'AFF-CODE' })
        }));

        // Capture before clearing - jest.clearAllMocks() below wipes every jest.fn()'s call
        // history, activeRepo's own mocks included, not just mockAffiliateRepo's.
        const activeHeader = activeRepo.createTransactionWithLines.mock.calls[0][0].header;

        jest.clearAllMocks();
        mockAffiliateRepo.getSettings.mockResolvedValue(defaultAffiliateSettings());
        mockAffiliateRepo.findActiveEnrollmentByShareCode.mockResolvedValue(activeEnrollment());
        mockAffiliateRepo.findEnrollmentById.mockResolvedValue(activeEnrollment({ status: 'revoked' }));
        mockAffiliateRepo.createEarnedCommissionIfMissing.mockResolvedValue({
            commission: { commission_id: 2, status: 'earned' }
        });

        const droppedRepo = buildFakePosRepository({ createdTransactionId: 612 });
        const droppedUseCase = buildCheckoutContractUseCase({
            posRepository: droppedRepo,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });
        const droppedResult = await runInTenantContext(() => droppedUseCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            payload: basePayload({ affiliate_code: 'AFF-CODE' })
        }));

        const droppedHeader = droppedRepo.createTransactionWithLines.mock.calls[0][0].header;

        expect(activeResult.success).toBe(true);
        expect(droppedResult.success).toBe(true);
        expect(activeHeader.subtotal_amount).toBe(droppedHeader.subtotal_amount);
        expect(activeHeader.total_amount).toBe(droppedHeader.total_amount);
        expect(droppedResult.data).toBeDefined();
    });
});

// #1239 (Phase 222): the composition test neither this file's use-case-direct tests (they hand-build
// `payload` and bypass the validator entirely - F8) nor posValidator.affiliateCode.test.js (it never
// calls the use case) can provide on its own. Runs the real validator, then feeds its real output -
// not a hand-built object - into the real use case exactly as posHandlers.js:863 does. Fails against
// unmodified develop: the field is stripped, so zero lookups happen and no commission accrues.
const mockValidatorRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('POS checkout — #1239 (Phase 222): affiliate_code reaches the use case via the real validator', () => {
    test('validator -> use case, end to end: a valid code accrues a commission through the real middleware', async () => {
        const req = { body: basePayload({ affiliate_code: 'AF-9K2XQ7' }) };
        const res = mockValidatorRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.affiliate_code).toBe('AF-9K2XQ7');

        const posRepository = buildFakePosRepository();
        const useCase = buildCheckoutContractUseCase({
            posRepository,
            inventoryCommandService: { createStockMovement: jest.fn() }
        });

        const result = await runInTenantContext(() => useCase({
            userId: 12,
            user: { user_id: 12, permissions: [] },
            // The real validator output, not a hand-built payload - this is the assertion that
            // closes F8's blind spot.
            payload: req.validatedData
        }));

        expect(result.success).toBe(true);
        expect(mockAffiliateRepo.findActiveEnrollmentByShareCode).toHaveBeenCalledTimes(1);
        expect(mockAffiliateRepo.findEnrollmentById).toHaveBeenCalledTimes(1);
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing).toHaveBeenCalledTimes(1);
        expect(mockAffiliateRepo.createEarnedCommissionIfMissing.mock.calls[0][0].enrollmentId)
            .toBe(ENROLLMENT_ID);
    });
});

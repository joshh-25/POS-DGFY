import { jest } from '@jest/globals';
import { buildFinalizeAvailmentUseCase } from '../../../src/modules/availments/usecases/availmentUseCases.js';
import { DomainError, DomainErrorCode } from '../../../src/shared/contracts/domainErrors.js';

/**
 * finalize.test.js — integration test for buildFinalizeAvailmentUseCase with
 * every injected port mocked (no live MySQL), mirroring
 * tests/integration/commerce/commerceModulesMount.test.js's convention of
 * proving orchestration/wiring behavior without a tenant database. Covers
 * RESEARCH's Validation Architecture target for this file: happy path,
 * CHK-06 no-open-shift, insufficient cash, D-24 fiscal hard-fail (no silent
 * downgrade), D-22 print-failure fail-open, D-14 recorded manual discount
 * (distinct receipt line + total reduction), and WARNING-1 insufficient-
 * stock full rollback.
 *
 * repository.finalizePersist is mocked at the AvailmentRepository boundary —
 * this test proves buildFinalizeAvailmentUseCase's OWN orchestration
 * (server-side money recompute, gate call + evidence assembly, shift
 * binding, receipt-payload shape, what it passes to finalizePersist, and
 * its post-commit print handling), not AvailmentRepository's internal
 * transaction mechanics (that belongs to 09-04's repository-level tests).
 */

const BUSINESS_ID = '11111111-1111-1111-1111-111111111111';
const AVAILMENT_ID = 42;

const makeBusiness = (overrides = {}) => ({
    id: BUSINESS_ID,
    display_name: 'Test Business',
    status: 'active',
    ...overrides
});

const makeMembership = (overrides = {}) => ({
    id: 1,
    account_id: 'acct-1',
    business_id: BUSINESS_ID,
    role: 'owner',
    status: 'active',
    ...overrides
});

const makeLine = (overrides = {}) => ({
    id: 1,
    availment_id: AVAILMENT_ID,
    product_id: 101,
    product_name: 'Coffee',
    quantity: '1.000000000000',
    unit_price: '112.0000',
    stock_effect_type: 'inventory_issue',
    cancelled_at: null,
    ...overrides
});

const makeAvailment = (overrides = {}) => ({
    id: AVAILMENT_ID,
    business_id: BUSINESS_ID,
    status: 'draft',
    branch_id: null,
    items: [makeLine()],
    discounts: [],
    payments: [],
    ...overrides
});

const ALLOW_DECISION = Object.freeze({
    decision: 'allow',
    reason_code: 'ALLOWED',
    mode_state: 'non_compliant_active',
    receipt_contract: { document_type: 'non_fiscal_slip', version: 1 }
});

/**
 * Builds a fresh set of mocked ports + the finalize usecase closed over
 * them. Each test overrides only what it needs.
 */
function buildHarness({
    availment = makeAvailment(),
    business = makeBusiness(),
    membership = makeMembership(),
    finalizePersistImpl,
    assertComplianceGateImpl,
    findOpenShiftImpl,
    printReceiptImpl,
    getForBusinessBranchImpl
} = {}) {
    const repository = {
        findById: jest.fn().mockResolvedValue(availment),
        finalizePersist: jest.fn(finalizePersistImpl || (async () => ({
            availment: { ...availment, status: 'finalized' },
            payment: { id: 900, payment_method: 'cash' },
            receipt: { id: 901, receipt_number: 'RCPT-TEST' }
        })))
    };

    const businessRepository = {
        findById: jest.fn().mockResolvedValue(business),
        getMembership: jest.fn().mockResolvedValue(membership)
    };

    const assertComplianceGate = jest.fn(assertComplianceGateImpl || (async () => ALLOW_DECISION));

    const recordSaleEffect = jest.fn();

    const shiftRepository = {
        findOpenShift: jest.fn(findOpenShiftImpl || (async () => ({ id: 55, status: 'open' })))
    };

    const complianceEvidenceRepository = {
        getForBusinessBranch: jest.fn(getForBusinessBranchImpl || (async () => null))
    };

    const deviceBridgeClient = {
        printReceipt: jest.fn(printReceiptImpl || (async () => ({ ok: true, result: { printed: true } })))
    };

    const finalizeAvailment = buildFinalizeAvailmentUseCase({
        repository,
        businessRepository,
        productRepository: {},
        assertComplianceGate,
        recordSaleEffect,
        shiftRepository,
        complianceEvidenceRepository,
        deviceBridgeClient
    });

    return {
        finalizeAvailment,
        repository,
        businessRepository,
        assertComplianceGate,
        recordSaleEffect,
        shiftRepository,
        complianceEvidenceRepository,
        deviceBridgeClient
    };
}

const baseInput = (overrides = {}) => ({
    businessId: BUSINESS_ID,
    requestingAccountId: 'acct-1',
    availmentId: AVAILMENT_ID,
    requestedDocumentContext: 'non_fiscal',
    paymentMethod: 'cash',
    cashReceived: '300.00',
    terminalId: 7,
    cashierAccountId: 3,
    ...overrides
});

describe('finalize.test.js — buildFinalizeAvailmentUseCase (09-06)', () => {
    // (a) Happy path — non_fiscal, client-total-ignored assertion --------
    it('happy path: recomputes totals server-side and ignores a client-supplied total/change/discount', async () => {
        const { finalizeAvailment, repository, deviceBridgeClient } = buildHarness();

        const result = await finalizeAvailment(baseInput({
            // A malicious/bogus client payload — finalizeAvailment never
            // destructures these fields, so they must have zero effect.
            total: '1.00',
            total_amount: '1.00',
            change: '999999.00',
            change_due: '999999.00',
            discount_amount: '500.00'
        }));

        expect(result.isSuccess).toBe(true);
        expect(repository.finalizePersist).toHaveBeenCalledTimes(1);

        const [, , persistArgs] = repository.finalizePersist.mock.calls[0];
        // quantity 1 x 112.00 (VAT-inclusive) => subtotal 112.00, VAT 12.00,
        // no discounts => total stays 112.00 — the server-computed value,
        // NOT the bogus '1.00' the client tried to submit.
        expect(persistArgs.header.total_amount).toBe('112.0000');
        expect(persistArgs.header.subtotal_amount).toBe('112.0000');
        expect(persistArgs.header.vat_amount).toBe('12.0000');
        // cash_received 300.00 - total 112.00 = change 188.00 (server-computed,
        // not the bogus 999999.00 the client tried to submit).
        expect(persistArgs.payment.change_due).toBe('188.0000');
        expect(persistArgs.payment.amount_received).toBe('300.0000');
        expect(persistArgs.saleEffectLines).toHaveLength(1);
        expect(persistArgs.saleEffectLines[0].productId).toBe(101);

        expect(deviceBridgeClient.printReceipt).toHaveBeenCalledTimes(1);
        expect(result.data.print_warning).toBeUndefined();
    });

    // (b) CHK-06 — no open shift -> conflict, no persist ------------------
    it('CHK-06: rejects with a conflict when no open shift exists for the cashier/terminal, never persists', async () => {
        const { finalizeAvailment, repository, shiftRepository } = buildHarness({
            findOpenShiftImpl: async () => null
        });

        const result = await finalizeAvailment(baseInput());

        expect(result.isSuccess).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(result.error.details?.error_code).toBe('NO_OPEN_SHIFT');
        expect(shiftRepository.findOpenShift).toHaveBeenCalledTimes(1);
        expect(repository.finalizePersist).not.toHaveBeenCalled();
    });

    // (c) Cash with cash_received < total -> rejected ---------------------
    it('rejects a cash payment whose cash_received is less than the computed total, before the gate is even called', async () => {
        const { finalizeAvailment, repository, assertComplianceGate } = buildHarness();

        const result = await finalizeAvailment(baseInput({ cashReceived: '10.00' })); // total is 112.00

        expect(result.isSuccess).toBe(false);
        expect(result.error.statusCode).toBe(400);
        expect(result.error.details?.error_code).toBe('CASH_INSUFFICIENT');
        expect(assertComplianceGate).not.toHaveBeenCalled();
        expect(repository.finalizePersist).not.toHaveBeenCalled();
    });

    // (d) D-24 — fiscal hard-fail without downgrade ------------------------
    it('D-24: a REQUIRES_SETUP gate response hard-fails a fiscal checkout and never downgrades to non_fiscal', async () => {
        const missingSignalError = new DomainError(
            DomainErrorCode.CONFLICT,
            'This operation requires completing the compliance activation checklist first.',
            {
                statusCode: 409,
                details: {
                    reason_code: 'COMPLIANCE_SETTINGS_INCOMPLETE',
                    decision: {
                        decision: 'requires_setup',
                        checklist: {
                            missing_setting_keys: ['pos_ptu_number'],
                            missing_artifacts: ['bir_accreditation_certificate'],
                            activation_blockers: [
                                { code: 'COMPLIANCE_SETTINGS_INCOMPLETE', section: 'settings', message: 'pos_ptu_number is missing.' }
                            ]
                        }
                    }
                }
            }
        );

        const { finalizeAvailment, repository, assertComplianceGate } = buildHarness({
            assertComplianceGateImpl: async () => { throw missingSignalError; }
        });

        const result = await finalizeAvailment(baseInput({ requestedDocumentContext: 'fiscal' }));

        expect(result.isSuccess).toBe(false);
        expect(result.error.statusCode).toBe(409);
        // The missing-signal detail is surfaced verbatim to the caller.
        expect(result.error.details.decision.checklist.missing_setting_keys).toEqual(['pos_ptu_number']);
        expect(result.error.details.decision.checklist.activation_blockers).toHaveLength(1);

        // Called with the ORIGINAL fiscal context — no retry/downgrade attempt.
        expect(assertComplianceGate).toHaveBeenCalledTimes(1);
        expect(assertComplianceGate.mock.calls[0][0].requestedDocumentContext).toBe('fiscal');
        expect(repository.finalizePersist).not.toHaveBeenCalled();
    });

    // (e) D-22 — print failure fail-open ------------------------------------
    it('D-22: a device-bridge print failure still succeeds with a print_warning, and the receipt is persisted', async () => {
        const { finalizeAvailment, repository, deviceBridgeClient } = buildHarness({
            printReceiptImpl: async () => ({ ok: false, warning: 'print_failed', error: 'PRINTER_OFFLINE' })
        });

        const result = await finalizeAvailment(baseInput());

        expect(result.isSuccess).toBe(true);
        expect(result.data.print_warning).toBe('print_failed');
        expect(repository.finalizePersist).toHaveBeenCalledTimes(1);
        expect(result.data.receipt).toEqual({ id: 901, receipt_number: 'RCPT-TEST' });
        expect(deviceBridgeClient.printReceipt).toHaveBeenCalledTimes(1);
    });

    // (f) D-14 — recorded manual discount reduces total + distinct receipt line
    it('D-14: a recorded manual discount reduces the server-computed total and appears as its own distinct receipt line', async () => {
        const availmentWithDiscount = makeAvailment({
            discounts: [{
                id: 5,
                availment_id: AVAILMENT_ID,
                discount_type: 'manual',
                code: null,
                amount: '20.0000',
                percent: null,
                applied_by_staff_account_id: 3,
                reason: 'Loyalty customer',
                sc_pwd_id_number: null,
                sc_pwd_customer_name: null
            }]
        });

        const { finalizeAvailment, repository } = buildHarness({ availment: availmentWithDiscount });

        const result = await finalizeAvailment(baseInput({ cashReceived: '100.00' })); // total will be 92.00

        expect(result.isSuccess).toBe(true);
        const [, , persistArgs] = repository.finalizePersist.mock.calls[0];

        // subtotal 112.00 - manual discount 20.00 = 92.00 (server-computed)
        expect(persistArgs.header.subtotal_amount).toBe('112.0000');
        expect(persistArgs.header.discount_amount).toBe('20.0000');
        expect(persistArgs.header.total_amount).toBe('92.0000');
        expect(persistArgs.payment.change_due).toBe('8.0000');

        // The discount must be its own distinct receipt line, not folded
        // into an aggregate — one entry in receipt.payload.discounts.
        const discountLines = persistArgs.receipt.payload.discounts;
        expect(discountLines).toHaveLength(1);
        expect(discountLines[0]).toMatchObject({
            discount_type: 'manual',
            reason: 'Loyalty customer',
            applied_by_staff_account_id: 3,
            amount_formatted: '20.0000'
        });
    });

    // (g) WARNING-1 — insufficient-stock rollback (nothing persisted) -------
    it('WARNING-1: an insufficient-stock sale-effect failure inside finalizePersist propagates so nothing is persisted', async () => {
        const insufficientStockError = new Error('Sale effect failed for product 101: insufficient stock for this product.');

        const { finalizeAvailment, repository, deviceBridgeClient } = buildHarness({
            finalizePersistImpl: async () => { throw insufficientStockError; }
        });

        await expect(finalizeAvailment(baseInput())).rejects.toThrow(/insufficient stock/i);

        expect(repository.finalizePersist).toHaveBeenCalledTimes(1);
        // Print must never be attempted when nothing was actually committed.
        expect(deviceBridgeClient.printReceipt).not.toHaveBeenCalled();
    });
});

import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const mockAssertComplianceOperationAllowed = jest.fn(async () => ({
    success: true,
    data: {
        decision: {
            operation: 'pos.terminal.operation',
            allowed: true
        }
    }
}));

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    assertComplianceOperationAllowed: mockAssertComplianceOperationAllowed,
    COMPLIANCE_OPERATION: {
        POS_TERMINAL_OPERATION: 'pos.terminal.operation'
    }
}));

let buildForceCloseStaleTerminalShiftUseCase;

beforeAll(async () => {
    const module = await import('../src/modules/pos/usecases/posUseCases.js');
    buildForceCloseStaleTerminalShiftUseCase = module.buildForceCloseStaleTerminalShiftUseCase;
});

const clone = (value) => JSON.parse(JSON.stringify(value));

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

const buildRepository = () => {
    const replays = new Map();
    const shift = {
        pos_terminal_shift_id: 51,
        cashier_id: 7,
        terminal_id: 'COUNTER-01',
        location_id: 3,
        business_date: '2026-07-23',
        opening_float_amount: 100,
        opened_at: '2026-07-23T00:00:00.000Z',
        closed_at: null,
        status: 'open'
    };
    const auditLogs = [];
    let closeCount = 0;
    let activeParkedSaleCount = 0;

    return {
        shift,
        auditLogs,
        get closeCount() {
            return closeCount;
        },
        setActiveParkedSaleCount(value) {
            activeParkedSaleCount = Math.max(0, Number.parseInt(value, 10) || 0);
        },
        async findOperationReplayByKey({ operationKey, idempotencyKey }) {
            return clone(replays.get(`${operationKey}::${idempotencyKey}`) || null);
        },
        async createOperationReplay(payload) {
            replays.set(
                `${payload.operation_key}::${payload.idempotency_key}`,
                clone(payload)
            );
            return clone(payload);
        },
        async getTerminalShiftById(shiftId) {
            return Number(shiftId) === shift.pos_terminal_shift_id
                ? clone(shift)
                : null;
        },
        async getShiftCashSalesTotal() {
            return 40;
        },
        async listCashDrawerEventsByShiftId() {
            return [
                { event_type: 'cash_in', amount: 10 },
                { event_type: 'cash_out', amount: 5 }
            ];
        },
        async countActiveParkedSalesForShift() {
            return activeParkedSaleCount;
        },
        async closeTerminalShift(shiftId, payload) {
            closeCount += 1;
            Object.assign(shift, payload);
            return clone(shift);
        },
        async createAuditLog(payload) {
            auditLogs.push(clone(payload));
            return clone(payload);
        }
    };
};

const runInTenantContext = async (sequelize, callback) => dbStore.run(
    {
        tenantId: 'tenant-shift-recovery',
        tenantComplianceModeState: 'compliant_pending',
        tenantComplianceModeChoiceRequired: false,
        tenantCompliancePolicyVersion: '2026.04.09',
        tenantComplianceProfile: {
            bir: {},
            npc: {}
        },
        sequelize
    },
    callback
);

describe('POS stale shift recovery use case', () => {
    it('force-closes a stale shift atomically while preserving the original operator', async () => {
        const repository = buildRepository();
        const transaction = createTransaction();
        const useCase = buildForceCloseStaleTerminalShiftUseCase({
            posRepository: repository,
            now: () => new Date('2026-07-23T13:00:00.000Z'),
            staleAfterHours: 12
        });

        const result = await runInTenantContext(
            { transaction: jest.fn(async () => transaction) },
            () => useCase({
                shiftId: 51,
                payload: {
                    idempotency_key: 'recovery-request-0001',
                    closing_cash_amount: 145,
                    reason: 'Operator left without closing'
                },
                user: {
                    user_id: 1,
                    is_master_admin: true
                }
            })
        );

        expect(result.success).toBe(true);
        expect(result.data.shift).toEqual(expect.objectContaining({
            cashier_id: 7,
            closed_by: 1,
            status: 'closed'
        }));
        expect(result.data.cash_summary).toEqual(expect.objectContaining({
            expected_cash_amount: 145,
            closing_cash_amount: 145,
            cash_variance_amount: 0
        }));
        expect(repository.closeCount).toBe(1);
        expect(repository.auditLogs).toHaveLength(1);
        expect(repository.auditLogs[0].changes).toEqual(expect.objectContaining({
            event: 'stale_shift_force_closed',
            original_cashier_id: 7
        }));
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
    });

    it('blocks stale recovery while active parked sales remain unresolved', async () => {
        const repository = buildRepository();
        repository.setActiveParkedSaleCount(1);
        const transaction = createTransaction();
        const useCase = buildForceCloseStaleTerminalShiftUseCase({
            posRepository: repository,
            now: () => new Date('2026-07-23T13:00:00.000Z'),
            staleAfterHours: 12
        });

        const result = await runInTenantContext(
            { transaction: jest.fn(async () => transaction) },
            () => useCase({
                shiftId: 51,
                payload: {
                    idempotency_key: 'recovery-request-parked-block',
                    closing_cash_amount: 145,
                    reason: 'Operator left without closing'
                },
                user: {
                    user_id: 1,
                    is_master_admin: true
                }
            })
        );

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_PARKED_SALES_UNRESOLVED',
            active_parked_sale_count: 1
        }));
        expect(repository.closeCount).toBe(0);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('returns the durable replay without closing the shift twice', async () => {
        const repository = buildRepository();
        const useCase = buildForceCloseStaleTerminalShiftUseCase({
            posRepository: repository,
            now: () => new Date('2026-07-23T13:00:00.000Z'),
            staleAfterHours: 12
        });
        const payload = {
            idempotency_key: 'recovery-request-0002',
            closing_cash_amount: 145,
            reason: 'Operator left without closing'
        };
        const sequelize = {
            transaction: jest.fn(async () => createTransaction())
        };

        const first = await runInTenantContext(sequelize, () => useCase({
            shiftId: 51,
            payload,
            user: { user_id: 1, is_master_admin: true }
        }));
        const replay = await runInTenantContext(sequelize, () => useCase({
            shiftId: 51,
            payload,
            user: { user_id: 1, is_master_admin: true }
        }));

        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(repository.closeCount).toBe(1);
    });

    it('rejects a non-stale shift and leaves it open', async () => {
        const repository = buildRepository();
        const transaction = createTransaction();
        const useCase = buildForceCloseStaleTerminalShiftUseCase({
            posRepository: repository,
            now: () => new Date('2026-07-23T08:00:00.000Z'),
            staleAfterHours: 12
        });

        const result = await runInTenantContext(
            { transaction: jest.fn(async () => transaction) },
            () => useCase({
                shiftId: 51,
                payload: {
                    idempotency_key: 'recovery-request-0003',
                    closing_cash_amount: 145,
                    reason: 'Operator left without closing'
                },
                user: { user_id: 1, is_master_admin: true }
            })
        );

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(repository.shift.status).toBe('open');
        expect(repository.closeCount).toBe(0);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });
});

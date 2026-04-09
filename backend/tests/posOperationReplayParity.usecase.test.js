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

let buildOpenTerminalShiftUseCase;
let buildRecordCashDrawerEventUseCase;
let buildCloseTerminalShiftUseCase;
let buildUpdateOnlineOrderStatusUseCase;

beforeAll(async () => {
    const posUseCasesModule = await import('../src/modules/pos/usecases/posUseCases.js');
    buildOpenTerminalShiftUseCase = posUseCasesModule.buildOpenTerminalShiftUseCase;
    buildRecordCashDrawerEventUseCase = posUseCasesModule.buildRecordCashDrawerEventUseCase;
    buildCloseTerminalShiftUseCase = posUseCasesModule.buildCloseTerminalShiftUseCase;
    buildUpdateOnlineOrderStatusUseCase = posUseCasesModule.buildUpdateOnlineOrderStatusUseCase;
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const createTransaction = () => {
    const transaction = {
        finished: false,
        LOCK: {
            UPDATE: 'UPDATE'
        },
        commit: jest.fn(async () => {
            transaction.finished = true;
        }),
        rollback: jest.fn(async () => {
            transaction.finished = true;
        })
    };
    return transaction;
};

const runInTenantContext = async ({ sequelize }, callback) => dbStore.run(
    {
        tenantId: 'tenant-nvp-01',
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

const buildReplayRepository = () => {
    const replays = new Map();
    const shifts = new Map();
    const cashEvents = [];
    const orders = new Map();
    const counters = {
        shiftCreates: 0,
        cashEventsCreated: 0,
        shiftCloses: 0,
        orderUpdates: 0
    };
    let shiftSequence = 1;

    const replayKey = ({ operationKey, idempotencyKey }) => `${operationKey}::${idempotencyKey}`;

    return {
        counters,
        seedOrder(order) {
            orders.set(Number(order.pos_transaction_id), clone(order));
        },
        async findOperationReplayByKey({ operationKey, idempotencyKey } = {}) {
            return clone(replays.get(replayKey({ operationKey, idempotencyKey })) || null);
        },
        async createOperationReplay(payload = {}) {
            const key = replayKey({
                operationKey: payload.operation_key,
                idempotencyKey: payload.idempotency_key
            });
            if (replays.has(key)) {
                return clone(replays.get(key));
            }
            const created = clone(payload);
            replays.set(key, created);
            return clone(created);
        },
        async findOpenTerminalShift({ terminalId = null, cashierId = null } = {}) {
            const shift = Array.from(shifts.values()).find((entry) => (
                entry.status === 'open'
                && (terminalId ? entry.terminal_id === terminalId : true)
                && (cashierId ? Number(entry.cashier_id) === Number(cashierId) : true)
            ));
            if (!shift) return null;
            return {
                ...clone(shift),
                cashEvents: cashEvents.filter(
                    (event) => Number(event.pos_terminal_shift_id) === Number(shift.pos_terminal_shift_id)
                )
            };
        },
        async createTerminalShift(payload = {}) {
            counters.shiftCreates += 1;
            const created = {
                pos_terminal_shift_id: shiftSequence++,
                ...clone(payload)
            };
            shifts.set(Number(created.pos_terminal_shift_id), created);
            return clone(created);
        },
        async getTerminalShiftById(shiftId) {
            const existing = shifts.get(Number(shiftId));
            if (!existing) return null;
            return {
                ...clone(existing),
                cashEvents: cashEvents.filter(
                    (event) => Number(event.pos_terminal_shift_id) === Number(shiftId)
                )
            };
        },
        async createCashDrawerEvent(payload = {}) {
            counters.cashEventsCreated += 1;
            const created = {
                pos_cash_drawer_event_id: cashEvents.length + 1,
                created_at: new Date().toISOString(),
                ...clone(payload)
            };
            cashEvents.push(created);
            return clone(created);
        },
        async listCashDrawerEventsByShiftId(shiftId) {
            return cashEvents
                .filter((entry) => Number(entry.pos_terminal_shift_id) === Number(shiftId))
                .map((entry) => clone(entry));
        },
        async getShiftCashSalesTotal() {
            return 0;
        },
        async closeTerminalShift(shiftId, payload = {}) {
            const existing = shifts.get(Number(shiftId));
            if (!existing) return null;
            counters.shiftCloses += 1;
            const next = {
                ...existing,
                ...clone(payload)
            };
            shifts.set(Number(shiftId), next);
            return clone(next);
        },
        async getOrderByIdForLifecycle(posTransactionId) {
            return clone(orders.get(Number(posTransactionId)) || null);
        },
        async updateOrderById(posTransactionId, payload = {}) {
            const existing = orders.get(Number(posTransactionId));
            if (!existing) return null;
            counters.orderUpdates += 1;
            const next = {
                ...existing,
                ...clone(payload)
            };
            orders.set(Number(posTransactionId), next);
            return clone(next);
        }
    };
};

describe('NVP-01 operation replay parity across terminal flows', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('keeps deterministic idempotent replay behavior across shift open/cash event/shift close/order-status update', async () => {
        const posRepository = buildReplayRepository();
        posRepository.seedOrder({
            pos_transaction_id: 910,
            order_source: 'online_store',
            order_method: 'pickup',
            fulfillment_status: 'placed',
            cashier_id: null,
            invoice_number: 'INV-00910',
            lines: [
                {
                    line_id: 1,
                    item_id: 11,
                    quantity: 2
                }
            ]
        });

        const openShiftUseCase = buildOpenTerminalShiftUseCase({ posRepository });
        const cashEventUseCase = buildRecordCashDrawerEventUseCase({ posRepository });
        const closeShiftUseCase = buildCloseTerminalShiftUseCase({ posRepository });
        const updateOrderStatusUseCase = buildUpdateOnlineOrderStatusUseCase({
            posRepository,
            stockMovementService: {
                createStockMovement: jest.fn()
            }
        });

        const sequelize = {
            transaction: jest.fn(async () => createTransaction())
        };

        await runInTenantContext({ sequelize }, async () => {
            const openPayload = {
                terminal_id: 'WEB-POS-01',
                business_date: '2026-04-09',
                opening_float_amount: 500,
                opening_note: 'Start of shift',
                idempotency_key: 'NVP-OPEN-20260409-0001'
            };
            const openFirst = await openShiftUseCase({
                payload: openPayload,
                user: { user_id: 17 }
            });
            expect(openFirst.success).toBe(true);
            expect(openFirst.data.idempotent_replay).toBe(false);
            expect(openFirst.data.replay_outcome).toBe('processed');

            const openReplay = await openShiftUseCase({
                payload: openPayload,
                user: { user_id: 17 }
            });
            expect(openReplay.success).toBe(true);
            expect(openReplay.data.idempotent_replay).toBe(true);
            expect(openReplay.data.replay_outcome).toBe('idempotent_replay');

            const shiftId = Number(openFirst.data?.shift?.pos_terminal_shift_id);
            expect(shiftId).toBeGreaterThan(0);

            const cashEventPayload = {
                idempotency_key: 'NVP-CASH-20260409-0001',
                event_type: 'cash_in',
                amount: 120,
                reason: 'Float top up'
            };
            const cashFirst = await cashEventUseCase({
                shiftId,
                payload: cashEventPayload,
                user: { user_id: 17 }
            });
            expect(cashFirst.success).toBe(true);
            expect(cashFirst.data.idempotent_replay).toBe(false);
            expect(cashFirst.data.replay_outcome).toBe('processed');

            const cashReplay = await cashEventUseCase({
                shiftId,
                payload: cashEventPayload,
                user: { user_id: 17 }
            });
            expect(cashReplay.success).toBe(true);
            expect(cashReplay.data.idempotent_replay).toBe(true);
            expect(cashReplay.data.replay_outcome).toBe('idempotent_replay');

            const closePayload = {
                idempotency_key: 'NVP-CLOSE-20260409-0001',
                closing_cash_amount: 620,
                closing_note: 'Balanced cash count'
            };
            const closeFirst = await closeShiftUseCase({
                shiftId,
                payload: closePayload,
                user: { user_id: 17 }
            });
            expect(closeFirst.success).toBe(true);
            expect(closeFirst.data.idempotent_replay).toBe(false);
            expect(closeFirst.data.replay_outcome).toBe('processed');

            const closeReplay = await closeShiftUseCase({
                shiftId,
                payload: closePayload,
                user: { user_id: 17 }
            });
            expect(closeReplay.success).toBe(true);
            expect(closeReplay.data.idempotent_replay).toBe(true);
            expect(closeReplay.data.replay_outcome).toBe('idempotent_replay');

            const updatePayload = {
                idempotency_key: 'NVP-ORDER-20260409-0910',
                fulfillment_status: 'confirmed'
            };
            const updateFirst = await updateOrderStatusUseCase({
                posTransactionId: 910,
                payload: updatePayload,
                user: { user_id: 17 }
            });
            expect(updateFirst.success).toBe(true);
            expect(updateFirst.data.idempotent_replay).toBe(false);
            expect(updateFirst.data.replay_outcome).toBe('processed');

            const updateReplay = await updateOrderStatusUseCase({
                posTransactionId: 910,
                payload: updatePayload,
                user: { user_id: 17 }
            });
            expect(updateReplay.success).toBe(true);
            expect(updateReplay.data.idempotent_replay).toBe(true);
            expect(updateReplay.data.replay_outcome).toBe('idempotent_replay');
        });

        expect(posRepository.counters.shiftCreates).toBe(1);
        expect(posRepository.counters.cashEventsCreated).toBe(1);
        expect(posRepository.counters.shiftCloses).toBe(1);
        expect(posRepository.counters.orderUpdates).toBe(1);
        expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    });

    it('returns deterministic conflict responses when idempotency key is reused with a different payload', async () => {
        const posRepository = buildReplayRepository();
        posRepository.seedOrder({
            pos_transaction_id: 911,
            order_source: 'online_store',
            order_method: 'pickup',
            fulfillment_status: 'placed',
            cashier_id: null,
            invoice_number: 'INV-00911',
            lines: [
                {
                    line_id: 1,
                    item_id: 11,
                    quantity: 2
                }
            ]
        });

        const openShiftUseCase = buildOpenTerminalShiftUseCase({ posRepository });
        const cashEventUseCase = buildRecordCashDrawerEventUseCase({ posRepository });
        const closeShiftUseCase = buildCloseTerminalShiftUseCase({ posRepository });
        const updateOrderStatusUseCase = buildUpdateOnlineOrderStatusUseCase({
            posRepository,
            stockMovementService: {
                createStockMovement: jest.fn()
            }
        });

        const sequelize = {
            transaction: jest.fn(async () => createTransaction())
        };

        await runInTenantContext({ sequelize }, async () => {
            const openFirst = await openShiftUseCase({
                payload: {
                    terminal_id: 'WEB-POS-01',
                    business_date: '2026-04-09',
                    opening_float_amount: 500,
                    opening_note: 'Open shift',
                    idempotency_key: 'NVP-CONFLICT-OPEN-01'
                },
                user: { user_id: 18 }
            });
            expect(openFirst.success).toBe(true);

            const openConflict = await openShiftUseCase({
                payload: {
                    terminal_id: 'WEB-POS-01',
                    business_date: '2026-04-09',
                    opening_float_amount: 501,
                    opening_note: 'Different payload',
                    idempotency_key: 'NVP-CONFLICT-OPEN-01'
                },
                user: { user_id: 18 }
            });
            expect(openConflict.success).toBe(false);
            expect(openConflict.error.code).toBe(DomainErrorCode.CONFLICT);

            const shiftId = Number(openFirst.data.shift.pos_terminal_shift_id);
            const cashFirst = await cashEventUseCase({
                shiftId,
                payload: {
                    idempotency_key: 'NVP-CONFLICT-CASH-01',
                    event_type: 'cash_in',
                    amount: 100,
                    reason: 'Cash in'
                },
                user: { user_id: 18 }
            });
            expect(cashFirst.success).toBe(true);

            const cashConflict = await cashEventUseCase({
                shiftId,
                payload: {
                    idempotency_key: 'NVP-CONFLICT-CASH-01',
                    event_type: 'cash_in',
                    amount: 101,
                    reason: 'Cash in'
                },
                user: { user_id: 18 }
            });
            expect(cashConflict.success).toBe(false);
            expect(cashConflict.error.code).toBe(DomainErrorCode.CONFLICT);

            const closeFirst = await closeShiftUseCase({
                shiftId,
                payload: {
                    idempotency_key: 'NVP-CONFLICT-CLOSE-01',
                    closing_cash_amount: 600,
                    closing_note: 'Close shift'
                },
                user: { user_id: 18 }
            });
            expect(closeFirst.success).toBe(true);

            const closeConflict = await closeShiftUseCase({
                shiftId,
                payload: {
                    idempotency_key: 'NVP-CONFLICT-CLOSE-01',
                    closing_cash_amount: 601,
                    closing_note: 'Different closing payload'
                },
                user: { user_id: 18 }
            });
            expect(closeConflict.success).toBe(false);
            expect(closeConflict.error.code).toBe(DomainErrorCode.CONFLICT);

            const orderFirst = await updateOrderStatusUseCase({
                posTransactionId: 911,
                payload: {
                    idempotency_key: 'NVP-CONFLICT-ORDER-01',
                    fulfillment_status: 'confirmed'
                },
                user: { user_id: 18 }
            });
            expect(orderFirst.success).toBe(true);

            const orderConflict = await updateOrderStatusUseCase({
                posTransactionId: 911,
                payload: {
                    idempotency_key: 'NVP-CONFLICT-ORDER-01',
                    fulfillment_status: 'rejected'
                },
                user: { user_id: 18 }
            });
            expect(orderConflict.success).toBe(false);
            expect(orderConflict.error.code).toBe(DomainErrorCode.CONFLICT);
        });
    });

    it('persists blocked replay outcomes and returns deterministic blocked idempotency metadata on retry', async () => {
        const posRepository = buildReplayRepository();
        const closedShift = await posRepository.createTerminalShift({
            business_date: '2026-04-09',
            terminal_id: 'WEB-POS-01',
            cashier_id: 19,
            status: 'closed'
        });
        const cashEventUseCase = buildRecordCashDrawerEventUseCase({ posRepository });

        const sequelize = {
            transaction: jest.fn(async () => createTransaction())
        };

        await runInTenantContext({ sequelize }, async () => {
            const payload = {
                idempotency_key: 'NVP-BLOCKED-CASH-01',
                event_type: 'cash_in',
                amount: 100,
                reason: 'Blocked replay test'
            };
            const firstAttempt = await cashEventUseCase({
                shiftId: closedShift.pos_terminal_shift_id,
                payload,
                user: { user_id: 19 }
            });
            expect(firstAttempt.success).toBe(false);
            expect(firstAttempt.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);

            const replayedBlockedAttempt = await cashEventUseCase({
                shiftId: closedShift.pos_terminal_shift_id,
                payload,
                user: { user_id: 19 }
            });
            expect(replayedBlockedAttempt.success).toBe(false);
            expect(replayedBlockedAttempt.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
            expect(replayedBlockedAttempt.error.details?.idempotency).toEqual({
                outcome: 'blocked',
                idempotent_replay: true
            });
        });

        expect(posRepository.counters.cashEventsCreated).toBe(0);
    });
});

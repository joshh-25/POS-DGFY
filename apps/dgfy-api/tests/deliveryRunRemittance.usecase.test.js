import { describe, expect, it } from '@jest/globals';
import {
    buildCreateDeliveryRunRemittanceUseCase,
    buildGetDeliveryRunRemittanceUseCase,
    buildResolveDeliveryRunRemittanceVarianceUseCase
} from '../src/modules/pos/usecases/deliveryRunUseCases.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import {
    createDeliveryRunTestHarness,
    createLocationScopeResolver,
    runInTenantContext
} from './testHelpers/deliveryRunTestHarness.js';

const addRemittanceState = (harness) => {
    harness.state.nextRemittanceId = 1;
    harness.state.nextAllocationId = 1;
    harness.state.nextVarianceId = 1;
    harness.state.remittances = new Map();
    harness.state.varianceIndex = new Map();

    const base = harness.deliveryRunRepository;
    const repository = {
        ...base,
        async getRunRemittanceMembers(runId, posTransactionIds) {
            const wanted = new Set(posTransactionIds.map(Number));
            return Array.from(harness.state.deliveryJobsById.values())
                .filter((job) => Number(job.delivery_run_id) === Number(runId) && wanted.has(Number(job.pos_transaction_id)))
                .map((job) => ({
                    ...job,
                    transaction: { ...(harness.state.orders.get(Number(job.pos_transaction_id)) || {}) }
                }));
        },
        async getRemittanceByRunId(runId) {
            return harness.state.remittances.get(Number(runId)) || null;
        },
        async createRemittance(payload) {
            const remittanceId = harness.state.nextRemittanceId++;
            const remittance = {
                delivery_run_remittance_id: remittanceId,
                delivery_run_id: payload.deliveryRunId,
                location_id: payload.locationId,
                confirmed_by: payload.confirmedBy,
                confirmed_at: payload.confirmedAt,
                total_expected_amount: payload.totalExpectedAmount,
                total_remitted_amount: payload.totalRemittedAmount,
                total_variance_amount: payload.totalVarianceAmount,
                allocations: [],
                created_at: payload.confirmedAt,
                updated_at: payload.confirmedAt
            };
            payload.allocations.forEach((allocation) => {
                const allocationRow = {
                    delivery_run_remittance_allocation_id: harness.state.nextAllocationId++,
                    delivery_run_remittance_id: remittanceId,
                    ...allocation,
                    variances: []
                };
                remittance.allocations.push(allocationRow);
                const variance = payload.variances.find((entry) => Number(entry.pos_transaction_id) === Number(allocation.pos_transaction_id));
                if (variance) {
                    const varianceRow = {
                        delivery_run_remittance_variance_id: harness.state.nextVarianceId++,
                        delivery_run_remittance_allocation_id: allocationRow.delivery_run_remittance_allocation_id,
                        entry_type: 'original',
                        reversal_of_variance_id: null,
                        ...variance,
                        reversals: []
                    };
                    allocationRow.variances.push(varianceRow);
                    harness.state.varianceIndex.set(varianceRow.delivery_run_remittance_variance_id, varianceRow);
                }
            });
            harness.state.remittances.set(Number(payload.deliveryRunId), remittance);
            return remittance;
        },
        async listRemittancesForRun(runId) {
            const remittance = harness.state.remittances.get(Number(runId));
            return remittance ? [remittance] : [];
        },
        async getRemittanceDetail(runId, remittanceId) {
            const remittance = harness.state.remittances.get(Number(runId));
            return remittance?.delivery_run_remittance_id === Number(remittanceId) ? remittance : null;
        },
        async getRemittanceVariance(runId, remittanceId, varianceId) {
            const remittance = harness.state.remittances.get(Number(runId));
            if (!remittance || remittance.delivery_run_remittance_id !== Number(remittanceId)) return null;
            return harness.state.varianceIndex.get(Number(varianceId)) || null;
        },
        async createVarianceResolution(payload) {
            const reversal = {
                delivery_run_remittance_variance_id: harness.state.nextVarianceId++,
                delivery_run_remittance_allocation_id: payload.allocationId,
                entry_type: 'reversal',
                reversal_of_variance_id: payload.reversalOfVarianceId,
                direction: payload.direction,
                amount: payload.amount,
                reason: payload.reason,
                recorded_by: payload.recordedBy,
                recorded_at: payload.recordedAt,
                reversals: []
            };
            const original = harness.state.varianceIndex.get(Number(payload.reversalOfVarianceId));
            original.reversals.push(reversal);
            harness.state.varianceIndex.set(reversal.delivery_run_remittance_variance_id, reversal);
            return reversal;
        }
    };
    return repository;
};

const prepareCashOrder = (harness, orderId, { cashReceived = '500.0000', changeAmount = '0.0000' } = {}) => {
    Object.assign(harness.state.orders.get(orderId), {
        cash_received: cashReceived,
        change_amount: changeAmount,
        payment_status: 'paid',
        balance_due: '0.0000'
    });
};

const setupRun = (harness, { provider = 'manual' } = {}) => {
    const run = harness.deliveryRunRepository.createRun({ label: 'Remittance run', location_id: 7, created_by: 12 });
    return run.then((created) => {
        harness.addOrder({
            orderId: 501,
            deliveryJobId: 601,
            runId: created.delivery_run_id,
            jobStatus: 'delivered',
            provider,
            deliveryPersonnelId: 21,
            deliveryPersonnelName: null
        });
        prepareCashOrder(harness, 501);
        return created;
    });
};

describe('delivery run remittance use cases', () => {
    it('records a normal cash remittance without changing payment fields', async () => {
        const harness = createDeliveryRunTestHarness();
        const repository = addRemittanceState(harness);
        const run = await setupRun(harness);
        const before = { ...harness.state.orders.get(501) };
        const useCase = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: harness.posRepository,
            deliveryRunRepository: repository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: {
                idempotency_key: 'remittance-normal-001',
                allocations: [{ pos_transaction_id: 501, remitted_amount: 500 }]
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.remittance).toMatchObject({
            delivery_run_id: run.delivery_run_id,
            total_expected_amount: 500,
            total_remitted_amount: 500,
            total_variance_amount: 0
        });
        expect(result.data.remittance.allocations[0].variances).toEqual([]);
        expect(harness.state.orders.get(501)).toEqual(before);
    });

    it('records shortages and overages only with a reason', async () => {
        const harness = createDeliveryRunTestHarness();
        const repository = addRemittanceState(harness);
        const run = await setupRun(harness);
        const useCase = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: harness.posRepository,
            deliveryRunRepository: repository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const missingReason = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'remittance-short-001', allocations: [{ pos_transaction_id: 501, remitted_amount: 490 }] },
            user: { user_id: 12 }
        }));
        expect(missingReason.error.details.reason_code).toBe('DELIVERY_RUN_VARIANCE_REASON_REQUIRED');

        const shortage = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: {
                idempotency_key: 'remittance-short-002',
                allocations: [{ pos_transaction_id: 501, remitted_amount: 490 }],
                variance_reason: 'Courier reported a missing bill'
            },
            user: { user_id: 12 }
        }));
        expect(shortage.success).toBe(true);
        expect(shortage.data.remittance.allocations[0].variances[0]).toMatchObject({ direction: 'shortage', amount: 10, resolved: false });

        const overageHarness = createDeliveryRunTestHarness();
        const overageRepository = addRemittanceState(overageHarness);
        const overageRun = await setupRun(overageHarness);
        const overageUseCase = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: overageHarness.posRepository,
            deliveryRunRepository: overageRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const overage = await runInTenantContext(() => overageUseCase({
            deliveryRunId: overageRun.delivery_run_id,
            payload: {
                idempotency_key: 'remittance-over-001',
                allocations: [{ pos_transaction_id: 501, remitted_amount: 510 }],
                variance_reason: 'Courier handed over an unidentified extra bill'
            },
            user: { user_id: 12 }
        }));
        expect(overage.success).toBe(true);
        expect(overage.data.remittance.allocations[0].variances[0]).toMatchObject({ direction: 'overage', amount: 10, resolved: false });
    });

    it('rejects a duplicate remittance and replays the original key', async () => {
        const harness = createDeliveryRunTestHarness();
        const repository = addRemittanceState(harness);
        const run = await setupRun(harness);
        const useCase = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: harness.posRepository,
            deliveryRunRepository: repository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const payload = { allocations: [{ pos_transaction_id: 501, remitted_amount: 500 }] };
        const first = await runInTenantContext(() => useCase({ deliveryRunId: run.delivery_run_id, payload: { ...payload, idempotency_key: 'remittance-duplicate-001' }, user: { user_id: 12 } }));
        const replay = await runInTenantContext(() => useCase({ deliveryRunId: run.delivery_run_id, payload: { ...payload, idempotency_key: 'remittance-duplicate-001' }, user: { user_id: 12 } }));
        const duplicate = await runInTenantContext(() => useCase({ deliveryRunId: run.delivery_run_id, payload: { ...payload, idempotency_key: 'remittance-duplicate-002' }, user: { user_id: 12 } }));

        expect(first.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(duplicate.error.details.reason_code).toBe('DELIVERY_RUN_REMITTANCE_ALREADY_EXISTS');
    });

    it('excludes provider-owned and non-cash members', async () => {
        const providerHarness = createDeliveryRunTestHarness();
        const providerRepository = addRemittanceState(providerHarness);
        const providerRun = await setupRun(providerHarness, { provider: 'grab' });
        const providerUseCase = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: providerHarness.posRepository,
            deliveryRunRepository: providerRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const providerResult = await runInTenantContext(() => providerUseCase({
            deliveryRunId: providerRun.delivery_run_id,
            payload: { idempotency_key: 'remittance-provider-001', allocations: [{ pos_transaction_id: 501, remitted_amount: 500 }] },
            user: { user_id: 12 }
        }));
        expect(providerResult.error.details.reason_code).toBe('DELIVERY_RUN_REMITTANCE_PROVIDER_UNSUPPORTED');

        const nonCashHarness = createDeliveryRunTestHarness();
        const nonCashRepository = addRemittanceState(nonCashHarness);
        const nonCashRun = await setupRun(nonCashHarness);
        nonCashHarness.state.orders.get(501).cash_received = null;
        const nonCashUseCase = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: nonCashHarness.posRepository,
            deliveryRunRepository: nonCashRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const nonCashResult = await runInTenantContext(() => nonCashUseCase({
            deliveryRunId: nonCashRun.delivery_run_id,
            payload: { idempotency_key: 'remittance-noncash-001', allocations: [{ pos_transaction_id: 501, remitted_amount: 500 }] },
            user: { user_id: 12 }
        }));
        expect(nonCashResult.error.details.reason_code).toBe('DELIVERY_RUN_REMITTANCE_NOTHING_TO_COLLECT');
    });

    it('rejects non-delivered members and orders outside the run', async () => {
        const harness = createDeliveryRunTestHarness();
        const repository = addRemittanceState(harness);
        const run = await setupRun(harness);
        harness.state.deliveryJobsById.get(601).status = 'picked_up';
        const useCase = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: harness.posRepository,
            deliveryRunRepository: repository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const notDelivered = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'remittance-not-delivered', allocations: [{ pos_transaction_id: 501, remitted_amount: 500 }] },
            user: { user_id: 12 }
        }));
        expect(notDelivered.error.details.reason_code).toBe('DELIVERY_RUN_REMITTANCE_MEMBER_NOT_DELIVERED');

        const outsideOrder = harness.addOrder({
            orderId: 502,
            deliveryJobId: 602,
            jobStatus: 'delivered',
            deliveryPersonnelId: 21
        });
        prepareCashOrder(harness, outsideOrder.order.pos_transaction_id);
        const notMember = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'remittance-not-member', allocations: [{ pos_transaction_id: 502, remitted_amount: 500 }] },
            user: { user_id: 12 }
        }));
        expect(notMember.error.details.reason_code).toBe('DELIVERY_RUN_REMITTANCE_MEMBER_NOT_FOUND');
    });

    it('requires supervisor authority and records an append-only resolution', async () => {
        const harness = createDeliveryRunTestHarness();
        const repository = addRemittanceState(harness);
        const run = await setupRun(harness);
        const create = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: harness.posRepository,
            deliveryRunRepository: repository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const created = await runInTenantContext(() => create({
            deliveryRunId: run.delivery_run_id,
            payload: {
                idempotency_key: 'remittance-resolution-001',
                allocations: [{ pos_transaction_id: 501, remitted_amount: 490 }],
                variance_reason: 'Short count'
            },
            user: { user_id: 12 }
        }));
        const variance = created.data.remittance.allocations[0].variances[0];
        const resolve = buildResolveDeliveryRunRemittanceVarianceUseCase({
            posRepository: harness.posRepository,
            deliveryRunRepository: repository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const unauthorized = await runInTenantContext(() => resolve({
            deliveryRunId: run.delivery_run_id,
            remittanceId: created.data.remittance.delivery_run_remittance_id,
            varianceId: variance.delivery_run_remittance_variance_id,
            payload: { idempotency_key: 'variance-resolution-unauthorized', resolution_reason: 'Reviewed' },
            user: { user_id: 12, permissions: [PERMISSIONS.POS.actions.TRANSACT_POS] }
        }));
        expect(unauthorized.error.details.reason_code).toBe('DELIVERY_RUN_VARIANCE_RESOLUTION_PERMISSION_REQUIRED');

        const resolved = await runInTenantContext(() => resolve({
            deliveryRunId: run.delivery_run_id,
            remittanceId: created.data.remittance.delivery_run_remittance_id,
            varianceId: variance.delivery_run_remittance_variance_id,
            payload: { idempotency_key: 'variance-resolution-authorized', resolution_reason: 'Supervisor counted and accepted the shortage' },
            user: { user_id: 12, role: 'manager' }
        }));
        expect(resolved.success).toBe(true);
        expect(resolved.data.original_variance).toMatchObject({ resolved: true, resolved_by: 12 });

        const second = await runInTenantContext(() => resolve({
            deliveryRunId: run.delivery_run_id,
            remittanceId: created.data.remittance.delivery_run_remittance_id,
            varianceId: variance.delivery_run_remittance_variance_id,
            payload: { idempotency_key: 'variance-resolution-second', resolution_reason: 'Second review' },
            user: { user_id: 12, role: 'manager' }
        }));
        expect(second.error.details.reason_code).toBe('DELIVERY_RUN_VARIANCE_ALREADY_RESOLVED');
    });

    it('denies a remittance read when the actor lacks the tenant location scope', async () => {
        const harness = createDeliveryRunTestHarness();
        const repository = addRemittanceState(harness);
        const run = await setupRun(harness);
        const create = buildCreateDeliveryRunRemittanceUseCase({
            posRepository: harness.posRepository,
            deliveryRunRepository: repository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const created = await runInTenantContext(() => create({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'remittance-cross-tenant-001', allocations: [{ pos_transaction_id: 501, remitted_amount: 500 }] },
            user: { user_id: 12 }
        }));
        const get = buildGetDeliveryRunRemittanceUseCase({
            deliveryRunRepository: repository,
            resolveLocationScope: createLocationScopeResolver({ 99: 8 })
        });
        const denied = await runInTenantContext(() => get({
            deliveryRunId: run.delivery_run_id,
            remittanceId: created.data.remittance.delivery_run_remittance_id,
            user: { user_id: 99 }
        }));
        expect(denied.error.statusCode).toBe(403);
        expect(denied.error.details.reason_code).toBe('POS_LOCATION_ACCESS_DENIED');
    });
});

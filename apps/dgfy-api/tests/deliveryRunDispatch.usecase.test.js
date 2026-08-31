// Phase 228 (#1273/#1271): buildDispatchDeliveryRunUseCase coverage -- run-level preconditions,
// the #1272 packing gate (retail-only), the per-order fan-out taxonomy, the D-3 best-effort run
// status flip, D-4's two-layer idempotency (durable replay + per-member ALREADY_DISPATCHED skip),
// and the pending_dispatch -> assigned job advance.

import { describe, expect, it, jest } from '@jest/globals';
import { buildDispatchDeliveryRunUseCase } from '../src/modules/pos/usecases/deliveryRunUseCases.js';
import {
    createDeliveryRunTestHarness,
    createLocationScopeResolver,
    runInTenantContext
} from './testHelpers/deliveryRunTestHarness.js';

const retailWorkflowSettings = async () => ({ mode: 'retail' });
const fnbWorkflowSettings = async () => ({ mode: 'food_and_beverage' });

const buildUseCase = (harness, overrides = {}) => buildDispatchDeliveryRunUseCase({
    posRepository: harness.posRepository,
    deliveryRunRepository: harness.deliveryRunRepository,
    resolveLocationScope: createLocationScopeResolver({ 12: 7 }),
    resolveWorkflowSettings: retailWorkflowSettings,
    activityRecorder: jest.fn(async () => {}),
    ...overrides
});

// A fully-assigned member: a completed personnel assignment + `packed` fulfillment status (clears
// the retail packing gate) + pending_dispatch job status.
const addDispatchReadyOrder = (harness, { orderId, deliveryJobId, runId, fulfillmentStatus = 'packed' }) => (
    harness.addOrder({
        orderId,
        deliveryJobId,
        runId,
        fulfillmentStatus,
        jobStatus: 'pending_dispatch',
        deliveryPersonnelId: 21,
        assignedBy: 12,
        assignedShiftId: 9,
        assignedAt: new Date('2026-08-31T08:00:00Z')
    })
);

const setupRunWithAccountable = async (harness, { locationId = 7 } = {}) => {
    const run = await harness.deliveryRunRepository.createRun({ label: 'Run A', location_id: locationId, created_by: 12 });
    await harness.deliveryRunRepository.replaceRunPersonnel(run.delivery_run_id, [
        { delivery_personnel_id: 21, is_accountable: true, created_by: 12, updated_by: 12 }
    ]);
    return run;
};

describe('buildDispatchDeliveryRunUseCase -- run-level preconditions', () => {
    it('404s for a missing run', async () => {
        const harness = createDeliveryRunTestHarness();
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: 999,
            payload: { idempotency_key: 'dispatch-404' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_NOT_FOUND');
    });

    it('409s DELIVERY_RUN_LOCKED for a completed run', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        await harness.deliveryRunRepository.updateRun(run.delivery_run_id, { status: 'completed' });
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-locked' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_LOCKED');
    });

    it('does NOT treat a `dispatched` run as locked -- re-dispatch is allowed through', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        addDispatchReadyOrder(harness, { orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id });
        await harness.deliveryRunRepository.updateRun(run.delivery_run_id, { status: 'dispatched' });
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-redispatch-not-locked' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.dispatched.map((entry) => entry.pos_transaction_id)).toEqual([501]);
    });

    it('409s DELIVERY_RUN_ACCOUNTABLE_REQUIRED when no accountable person is set', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await harness.deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-no-accountable' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_ACCOUNTABLE_REQUIRED');
    });

    it('409s DELIVERY_RUN_EMPTY when the run has zero members', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-empty' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_EMPTY');
    });
});

describe('buildDispatchDeliveryRunUseCase -- #1272 packing gate', () => {
    it('409s DELIVERY_RUN_UNPACKED_MEMBERS in retail mode, naming every offender, and writes nothing', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        addDispatchReadyOrder(harness, { orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id, fulfillmentStatus: 'packed' });
        addDispatchReadyOrder(harness, { orderId: 502, deliveryJobId: 602, runId: run.delivery_run_id, fulfillmentStatus: 'preparing' });
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-unpacked' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_UNPACKED_MEMBERS');
        expect(result.error.details.unpacked).toEqual([
            { pos_transaction_id: 502, fulfillment_status: 'preparing' }
        ]);
        const untouchedRun = await harness.deliveryRunRepository.getRunById(run.delivery_run_id);
        expect(untouchedRun.status).not.toBe('dispatched');
        const untouchedOrder = await harness.posRepository.getOrderByIdForLifecycle(501);
        expect(untouchedOrder.fulfillment_status).toBe('packed');
    });

    it('skips the packing gate entirely in food_and_beverage mode -- ONLINE_FULFILLMENT_TRANSITIONS unaffected', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        addDispatchReadyOrder(harness, { orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id, fulfillmentStatus: 'preparing' });
        const useCase = buildUseCase(harness, { resolveWorkflowSettings: fnbWorkflowSettings });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-fnb' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.dispatched.map((entry) => entry.pos_transaction_id)).toEqual([501]);
    });
});

describe('buildDispatchDeliveryRunUseCase -- fan-out taxonomy', () => {
    it('classifies every member per the reason-code taxonomy in one mixed call', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);

        // Success.
        addDispatchReadyOrder(harness, { orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id });
        // Not an online delivery order (pickup method) -> DELIVERY_ORDER_REQUIRED.
        addDispatchReadyOrder(harness, { orderId: 502, deliveryJobId: 602, runId: run.delivery_run_id });
        harness.state.orders.get(502).order_method = 'pickup';
        // Location mismatch (order's location diverges from the run's after membership).
        addDispatchReadyOrder(harness, { orderId: 503, deliveryJobId: 603, runId: run.delivery_run_id });
        harness.state.orders.get(503).location_id = 999;
        // Non-manual provider -> MANUAL_DELIVERY_JOB_REQUIRED.
        harness.addOrder({
            orderId: 504, deliveryJobId: 604, runId: run.delivery_run_id, provider: 'lalamove',
            fulfillmentStatus: 'packed', jobStatus: 'pending_dispatch'
        });
        // No completed assignment -> DELIVERY_ASSIGNMENT_REQUIRED.
        harness.addOrder({
            orderId: 505, deliveryJobId: 605, runId: run.delivery_run_id,
            fulfillmentStatus: 'packed', jobStatus: 'pending_dispatch'
        });
        // Job already past pending_dispatch -> DELIVERY_JOB_ASSIGNMENT_LOCKED.
        addDispatchReadyOrder(harness, { orderId: 506, deliveryJobId: 606, runId: run.delivery_run_id });
        harness.state.deliveryJobsByOrder.get(506).status = 'picked_up';
        // Transition validator rejects (ready_for_pickup has no edge to out_for_delivery).
        addDispatchReadyOrder(harness, { orderId: 507, deliveryJobId: 607, runId: run.delivery_run_id, fulfillmentStatus: 'ready_for_pickup' });

        const useCase = buildUseCase(harness);
        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-taxonomy' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        const { dispatched, skipped, failed } = result.data;
        expect(dispatched.map((entry) => entry.pos_transaction_id)).toEqual([501]);
        expect(skipped).toEqual([]);
        const byOrderId = Object.fromEntries(failed.map((entry) => [entry.pos_transaction_id, entry.reason_code]));
        expect(byOrderId).toEqual({
            502: 'DELIVERY_ORDER_REQUIRED',
            503: 'DELIVERY_RUN_LOCATION_MISMATCH',
            504: 'MANUAL_DELIVERY_JOB_REQUIRED',
            505: 'DELIVERY_ASSIGNMENT_REQUIRED',
            506: 'DELIVERY_JOB_ASSIGNMENT_LOCKED',
            507: 'ORDER_STATUS_TRANSITION_INVALID'
        });

        // Only the one genuine success was written.
        const dispatchedOrder = await harness.posRepository.getOrderByIdForLifecycle(501);
        expect(dispatchedOrder.fulfillment_status).toBe('out_for_delivery');
        const dispatchedJob = harness.state.deliveryJobsByOrder.get(501);
        expect(dispatchedJob.status).toBe('assigned');
        const untouchedFailure = await harness.posRepository.getOrderByIdForLifecycle(505);
        expect(untouchedFailure.fulfillment_status).toBe('packed');
    });
});

describe('buildDispatchDeliveryRunUseCase -- run status flip (D-3)', () => {
    it('flips the run to dispatched when at least one member succeeds', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        addDispatchReadyOrder(harness, { orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id });
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-flip' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.run_status).toEqual({ previous: 'draft', current: 'dispatched', advanced: true });
        expect(result.data.run.status).toBe('dispatched');
    });

    it('does NOT flip run status when every member fails', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        harness.addOrder({
            orderId: 505, deliveryJobId: 605, runId: run.delivery_run_id,
            fulfillmentStatus: 'packed', jobStatus: 'pending_dispatch'
        });
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-no-flip' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.dispatched).toEqual([]);
        expect(result.data.failed).toHaveLength(1);
        expect(result.data.run_status).toEqual({ previous: 'draft', current: 'draft', advanced: false });
        const untouchedRun = await harness.deliveryRunRepository.getRunById(run.delivery_run_id);
        expect(untouchedRun.status).toBe('draft');
    });
});

describe('buildDispatchDeliveryRunUseCase -- re-dispatch and ALREADY_DISPATCHED (D-4 layer 2)', () => {
    it('a second dispatch call with a different idempotency key skips already-dispatched members and does not double-write', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        addDispatchReadyOrder(harness, { orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id });
        const useCase = buildUseCase(harness);

        const first = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-first' },
            user: { user_id: 12 }
        }));
        expect(first.data.dispatched.map((entry) => entry.pos_transaction_id)).toEqual([501]);

        const second = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-second-different-key' },
            user: { user_id: 12 }
        }));

        expect(second.success).toBe(true);
        expect(second.data.dispatched).toEqual([]);
        expect(second.data.skipped).toEqual([
            { pos_transaction_id: 501, reason_code: 'ALREADY_DISPATCHED', idempotent_no_op: true }
        ]);
        // Run stays dispatched (already was); job stays `assigned`, not re-written to some other value.
        const job = harness.state.deliveryJobsByOrder.get(501);
        expect(job.status).toBe('assigned');
    });

    it('advances a job still stuck at pending_dispatch with a complete assignment even when the order is already out_for_delivery', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        addDispatchReadyOrder(harness, { orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id, fulfillmentStatus: 'out_for_delivery' });
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-stuck-job' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.skipped).toEqual([
            { pos_transaction_id: 501, reason_code: 'ALREADY_DISPATCHED', idempotent_no_op: true }
        ]);
        expect(harness.state.deliveryJobsByOrder.get(501).status).toBe('assigned');
    });
});

describe('buildDispatchDeliveryRunUseCase -- durable replay (D-4 layer 1)', () => {
    it('replays a processed dispatch for the same idempotency key without re-executing', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        addDispatchReadyOrder(harness, { orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id });
        const useCase = buildUseCase(harness);

        const first = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-replay-001' },
            user: { user_id: 12 }
        }));
        expect(first.data.idempotency.idempotent_replay).toBe(false);

        const replay = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-replay-001' },
            user: { user_id: 12 }
        }));

        expect(replay.success).toBe(true);
        expect(replay.data.dispatched.map((entry) => entry.pos_transaction_id)).toEqual([501]);
    });

    it('persists a blocked replay entry when a precondition rejects the call', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        await harness.deliveryRunRepository.updateRun(run.delivery_run_id, { status: 'completed' });
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-blocked-001' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(harness.state.replays.has('terminal.delivery_run_dispatch:dispatch-blocked-001')).toBe(true);
        const replayed = harness.state.replays.get('terminal.delivery_run_dispatch:dispatch-blocked-001');
        expect(replayed.replay_status).toBe('blocked');
    });
});

describe('buildDispatchDeliveryRunUseCase -- validation', () => {
    it('requires an idempotency key', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: {},
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('requires an authenticated actor', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRunWithAccountable(harness);
        const useCase = buildUseCase(harness);

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'dispatch-no-auth' },
            user: {}
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('AUTHENTICATION_FAILED');
    });
});

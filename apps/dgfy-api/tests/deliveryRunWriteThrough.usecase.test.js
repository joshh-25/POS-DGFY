import { describe, expect, it } from '@jest/globals';
import {
    buildAddDeliveryRunMembersUseCase,
    buildRemoveDeliveryRunMemberUseCase
} from '../src/modules/pos/usecases/deliveryRunUseCases.js';
import {
    createDeliveryRunTestHarness,
    createLocationScopeResolver,
    runInTenantContext
} from './testHelpers/deliveryRunTestHarness.js';

const setAccountable = async (deliveryRunRepository, runId, row) => (
    deliveryRunRepository.replaceRunPersonnel(runId, [{ ...row, is_accountable: true }])
);

describe('Delivery run membership write-through (Phase 225)', () => {
    it('refuses to add members to a run with no accountable person', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        addOrder({ orderId: 501, deliveryJobId: 601 });
        const useCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'add-members-001', pos_transaction_ids: [501] },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_ACCOUNTABLE_REQUIRED');
    });

    it('refuses to add a non-manual delivery job', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 502, deliveryJobId: 602, provider: 'provider_x' });
        const useCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'add-members-002', pos_transaction_ids: [502] },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('MANUAL_DELIVERY_JOB_REQUIRED');
    });

    it('refuses to add an order whose location does not match the run', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 503, deliveryJobId: 603, locationId: 8 });
        const useCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'add-members-003', pos_transaction_ids: [503] },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_LOCATION_MISMATCH');
    });

    it('adds an order whose fulfillment_status is preparing (never packed) and leaves job status pending_dispatch', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder, state } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 504, deliveryJobId: 604, fulfillmentStatus: 'preparing' });
        const useCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'add-members-004', pos_transaction_ids: [504] },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.added).toHaveLength(1);
        const job = state.deliveryJobsById.get(604);
        expect(job.delivery_run_id).toBe(run.delivery_run_id);
        expect(job.status).toBe('pending_dispatch');
        expect(job.delivery_personnel_id).toBe(21);
        expect(job.assigned_by).toBe(12);
        expect(job.assigned_shift_id).toBe(9);
        expect(job.assigned_at).toBeTruthy();
    });

    it('replays an idempotency_key without a second write', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder, state } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 505, deliveryJobId: 605 });
        const useCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const payload = { idempotency_key: 'add-members-005', pos_transaction_ids: [505] };

        const first = await runInTenantContext(() => useCase({ deliveryRunId: run.delivery_run_id, payload, user: { user_id: 12 } }));
        const replay = await runInTenantContext(() => useCase({ deliveryRunId: run.delivery_run_id, payload, user: { user_id: 12 } }));

        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(state.audit.filter((entry) => entry.changes.event === 'delivery_run_members_added')).toHaveLength(1);
    });

    it('writes a free-text accountable name through as delivery_personnel_name', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder, state } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_name: 'Juan Dela Cruz' });
        addOrder({ orderId: 506, deliveryJobId: 606 });
        const useCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'add-members-006', pos_transaction_ids: [506] },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        const job = state.deliveryJobsById.get(606);
        expect(job.delivery_personnel_id).toBeNull();
        expect(job.delivery_personnel_name).toBe('Juan Dela Cruz');
    });

    it('removal clears the assignment when run-owned and still pending_dispatch', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder, state } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 507, deliveryJobId: 607 });
        const addUseCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        await runInTenantContext(() => addUseCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'add-members-007', pos_transaction_ids: [507] },
            user: { user_id: 12 }
        }));

        const removeUseCase = buildRemoveDeliveryRunMemberUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const result = await runInTenantContext(() => removeUseCase({
            deliveryRunId: run.delivery_run_id,
            posTransactionId: 507,
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.assignment_cleared).toBe(true);
        const job = state.deliveryJobsById.get(607);
        expect(job.delivery_run_id).toBeNull();
        expect(job.delivery_personnel_id).toBeNull();
        expect(job.assigned_by).toBeNull();
    });

    it('removal leaves the assignment when it was overwritten per-order (identity mismatch)', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder, state } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 508, deliveryJobId: 608 });
        const addUseCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        await runInTenantContext(() => addUseCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'add-members-008', pos_transaction_ids: [508] },
            user: { user_id: 12 }
        }));

        // Simulate a per-order re-assignment to a different courier after the run write-through.
        const job = state.deliveryJobsById.get(608);
        job.delivery_personnel_id = null;
        job.delivery_personnel_name = 'Someone Else';

        const removeUseCase = buildRemoveDeliveryRunMemberUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const result = await runInTenantContext(() => removeUseCase({
            deliveryRunId: run.delivery_run_id,
            posTransactionId: 508,
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.assignment_cleared).toBe(false);
        expect(result.data.reason_code).toBe('DELIVERY_ASSIGNMENT_NOT_RUN_OWNED');
        expect(job.delivery_run_id).toBeNull();
        expect(job.delivery_personnel_name).toBe('Someone Else');
    });

    it('removal leaves the assignment when the job is past pending_dispatch', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder, state } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 509, deliveryJobId: 609 });
        const addUseCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        await runInTenantContext(() => addUseCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'add-members-009', pos_transaction_ids: [509] },
            user: { user_id: 12 }
        }));

        const job = state.deliveryJobsById.get(609);
        job.status = 'assigned';

        const removeUseCase = buildRemoveDeliveryRunMemberUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const result = await runInTenantContext(() => removeUseCase({
            deliveryRunId: run.delivery_run_id,
            posTransactionId: 509,
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.assignment_cleared).toBe(false);
        expect(result.data.reason_code).toBe('DELIVERY_JOB_ASSIGNMENT_LOCKED');
        expect(job.delivery_run_id).toBeNull();
        expect(job.delivery_personnel_id).toBe(21);
    });

    // RF-1 fix (PR #1276 review): a POS user scoped to location A must never be able to add
    // members to, or remove members from, a run belonging to location B. Actor (user 12) is
    // scoped to location 7; the run here belongs to location 8.
    it('add-members denies adding to a run belonging to another location', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder, state } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run B', location_id: 8, created_by: 99 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 510, deliveryJobId: 610, locationId: 8 });
        const useCase = buildAddDeliveryRunMembersUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'cross-location-add-members', pos_transaction_ids: [510] },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('POS_LOCATION_ACCESS_DENIED');
        expect(state.deliveryJobsById.get(610).delivery_run_id).toBeNull();
    });

    it('remove-member denies removing a member from a run belonging to another location', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository, addOrder, state } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run B', location_id: 8, created_by: 99 });
        await setAccountable(deliveryRunRepository, run.delivery_run_id, { delivery_personnel_id: 21 });
        addOrder({ orderId: 511, deliveryJobId: 611, locationId: 8, runId: run.delivery_run_id });
        const useCase = buildRemoveDeliveryRunMemberUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            posTransactionId: 511,
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('POS_LOCATION_ACCESS_DENIED');
        expect(state.deliveryJobsById.get(611).delivery_run_id).toBe(run.delivery_run_id);
    });
});

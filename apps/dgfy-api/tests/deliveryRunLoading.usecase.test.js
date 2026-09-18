import { describe, expect, it } from '@jest/globals';
import {
    buildConfirmDeliveryRunLoadingUseCase,
    buildRemoveDeliveryRunMemberUseCase,
    buildUpdateDeliveryRunMemberLoadingUseCase
} from '../src/modules/pos/usecases/deliveryRunUseCases.js';
import {
    createDeliveryRunTestHarness,
    createLocationScopeResolver,
    runInTenantContext
} from './testHelpers/deliveryRunTestHarness.js';

const buildLoadingUseCase = (harness) => buildUpdateDeliveryRunMemberLoadingUseCase({
    posRepository: harness.posRepository,
    deliveryRunRepository: harness.deliveryRunRepository,
    resolveLocationScope: createLocationScopeResolver({ 12: 7 })
});

const buildConfirmUseCase = (harness) => buildConfirmDeliveryRunLoadingUseCase({
    posRepository: harness.posRepository,
    deliveryRunRepository: harness.deliveryRunRepository,
    resolveLocationScope: createLocationScopeResolver({ 12: 7 })
});

const setupRun = async (harness, memberCount = 1) => {
    const run = await harness.deliveryRunRepository.createRun({ label: 'Loading run', location_id: 7, created_by: 12 });
    await harness.deliveryRunRepository.replaceRunPersonnel(run.delivery_run_id, [
        { delivery_personnel_id: 21, is_accountable: true, created_by: 12, updated_by: 12 }
    ]);
    for (let index = 0; index < memberCount; index += 1) {
        harness.addOrder({
            orderId: 501 + index,
            deliveryJobId: 601 + index,
            runId: run.delivery_run_id,
            fulfillmentStatus: 'packed'
        });
    }
    return run;
};

const mark = (useCase, runId, orderId, state, key, reason) => runInTenantContext(() => useCase({
    deliveryRunId: runId,
    posTransactionId: orderId,
    payload: { idempotency_key: key, loading_state: state, exception_reason: reason },
    user: { user_id: 12 }
}));

describe('delivery run loading verification', () => {
    it('keeps an unmarked member pending and distinguishes explicit not_loaded', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRun(harness, 2);
        const useCase = buildLoadingUseCase(harness);

        const before = await harness.deliveryRunRepository.getRunDetail(run.delivery_run_id);
        expect(before.deliveryJobs[0].loading_state).toBe('pending');

        const result = await mark(useCase, run.delivery_run_id, 501, 'not_loaded', 'loading-not-loaded-001');
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ pos_transaction_id: 501, loading_state: 'not_loaded' });

        const detail = await harness.deliveryRunRepository.getRunDetail(run.delivery_run_id);
        const states = detail.deliveryJobs.map((job) => job.loading_state);
        expect(states).toEqual(['not_loaded', 'pending']);
    });

    it('requires an exception reason and clears it when state changes', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRun(harness);
        const useCase = buildLoadingUseCase(harness);

        const missingReason = await mark(useCase, run.delivery_run_id, 501, 'exception', 'loading-exception-001', '   ');
        expect(missingReason.success).toBe(false);
        expect(missingReason.error.details.reason_code).toBe('DELIVERY_RUN_LOADING_REASON_REQUIRED');

        const exception = await mark(useCase, run.delivery_run_id, 501, 'exception', 'loading-exception-002', 'Damaged carton');
        expect(exception.success).toBe(true);
        expect(exception.data).toMatchObject({ loading_state: 'exception', loading_exception_reason: 'Damaged carton' });

        const loaded = await mark(useCase, run.delivery_run_id, 501, 'loaded', 'loading-loaded-001');
        expect(loaded.success).toBe(true);
        expect(loaded.data).toMatchObject({ loading_state: 'loaded', loading_exception_reason: null });
    });

    it('replays confirmation with the same key and allows a later confirmation with a new key', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRun(harness, 2);
        const useCase = buildConfirmUseCase(harness);

        const first = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'loading-confirm-001' },
            user: { user_id: 12 }
        }));
        const replay = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'loading-confirm-001' },
            user: { user_id: 12 }
        }));
        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.loading_confirmed_at).toBe(first.data.loading_confirmed_at);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(harness.state.audit).toHaveLength(1);

        const second = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'loading-confirm-002' },
            user: { user_id: 12 }
        }));
        expect(second.success).toBe(true);
        expect(harness.state.audit).toHaveLength(2);
    });

    it('returns the loading summary without requiring every member to be loaded', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRun(harness, 3);
        const markUseCase = buildLoadingUseCase(harness);
        await mark(markUseCase, run.delivery_run_id, 501, 'loaded', 'loading-summary-001');
        await mark(markUseCase, run.delivery_run_id, 502, 'exception', 'loading-summary-002', 'Missing seal');

        const result = await runInTenantContext(() => buildConfirmUseCase(harness)({
            deliveryRunId: run.delivery_run_id,
            payload: { idempotency_key: 'loading-summary-confirm' },
            user: { user_id: 12 }
        }));
        expect(result.success).toBe(true);
        expect(result.data.loading_summary).toEqual({
            pending_count: 1,
            loaded_count: 1,
            not_loaded_count: 0,
            exception_count: 1,
            total_count: 3
        });
    });

    it('rejects locked, empty, missing, and cross-location members', async () => {
        const harness = createDeliveryRunTestHarness();
        const useCase = buildLoadingUseCase(harness);

        const missing = await mark(useCase, 999, 501, 'loaded', 'loading-missing-001');
        expect(missing.error.details.reason_code).toBe('DELIVERY_RUN_NOT_FOUND');

        const emptyRun = await setupRun(harness, 0);
        const emptyConfirm = await runInTenantContext(() => buildConfirmUseCase(harness)({
            deliveryRunId: emptyRun.delivery_run_id,
            payload: { idempotency_key: 'loading-empty-001' },
            user: { user_id: 12 }
        }));
        expect(emptyConfirm.error.details.reason_code).toBe('DELIVERY_RUN_EMPTY');

        const run = await setupRun(harness);
        await harness.deliveryRunRepository.updateRun(run.delivery_run_id, { status: 'cancelled' });
        const locked = await mark(useCase, run.delivery_run_id, 501, 'loaded', 'loading-locked-001');
        expect(locked.error.details.reason_code).toBe('DELIVERY_RUN_LOCKED');

        const openRun = await setupRun(harness);
        const memberMissing = await mark(useCase, openRun.delivery_run_id, 999, 'loaded', 'loading-member-missing-001');
        expect(memberMissing.error.details.reason_code).toBe('DELIVERY_RUN_MEMBER_NOT_FOUND');

        const otherLocationRun = await harness.deliveryRunRepository.createRun({
            label: 'Other location run',
            location_id: 99,
            created_by: 12
        });
        harness.addOrder({
            orderId: 777,
            deliveryJobId: 877,
            runId: otherLocationRun.delivery_run_id,
            fulfillmentStatus: 'packed'
        });
        const crossLocation = await mark(useCase, otherLocationRun.delivery_run_id, 777, 'loaded', 'loading-cross-location-001');
        expect(crossLocation.error.details.reason_code).toBe('POS_LOCATION_ACCESS_DENIED');
    });

    it('clears loading fields when removing a run member', async () => {
        const harness = createDeliveryRunTestHarness();
        const run = await setupRun(harness);
        const loadingUseCase = buildLoadingUseCase(harness);
        await mark(loadingUseCase, run.delivery_run_id, 501, 'exception', 'loading-remove-001', 'Damaged');

        const removeUseCase = buildRemoveDeliveryRunMemberUseCase({
            posRepository: harness.posRepository,
            deliveryRunRepository: harness.deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const removed = await runInTenantContext(() => removeUseCase({
            deliveryRunId: run.delivery_run_id,
            posTransactionId: 501,
            user: { user_id: 12 }
        }));
        expect(removed.success).toBe(true);
        expect(harness.state.deliveryJobsById.get(601)).toMatchObject({
            delivery_run_id: null,
            loading_state: 'pending',
            loading_exception_reason: null,
            loading_marked_by: null,
            loading_marked_at: null
        });
    });
});

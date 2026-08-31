import { describe, expect, it, jest } from '@jest/globals';
import {
    buildCreateDeliveryRunUseCase,
    buildListDeliveryRunsUseCase,
    buildGetDeliveryRunUseCase,
    buildUpdateDeliveryRunUseCase,
    buildSetDeliveryRunPersonnelUseCase
} from '../src/modules/pos/usecases/deliveryRunUseCases.js';
import {
    createDeliveryRunTestHarness,
    createLocationScopeResolver,
    runInTenantContext
} from './testHelpers/deliveryRunTestHarness.js';

describe('Delivery run use cases (Phase 225)', () => {
    it('creates a draft run with a resolved location scope', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const resolveLocationScope = jest.fn(async () => ({ location_id: 7 }));
        const useCase = buildCreateDeliveryRunUseCase({ deliveryRunRepository, resolveLocationScope });

        const result = await useCase({
            payload: { label: 'Morning Run', scheduled_date: '2026-09-02' },
            user: { user_id: 12 }
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            label: 'Morning Run',
            status: 'draft',
            location_id: 7,
            created_by: 12,
            personnel: [],
            members: []
        });
        expect(resolveLocationScope).toHaveBeenCalled();
    });

    it('rejects run creation without an authenticated actor', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const useCase = buildCreateDeliveryRunUseCase({
            deliveryRunRepository,
            resolveLocationScope: jest.fn(async () => ({ location_id: 7 }))
        });

        const result = await useCase({ payload: { label: 'Run' }, user: {} });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('lists runs with a member count', async () => {
        const harness = createDeliveryRunTestHarness();
        const { deliveryRunRepository, addOrder } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        addOrder({ orderId: 501, deliveryJobId: 601, runId: run.delivery_run_id });

        const useCase = buildListDeliveryRunsUseCase({
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });
        const result = await useCase({ query: {}, user: { user_id: 12 } });

        expect(result.success).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items[0]).toMatchObject({ delivery_run_id: run.delivery_run_id, member_count: 1 });
    });

    it('returns 404 for a missing run on get', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const useCase = buildGetDeliveryRunUseCase({
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await useCase({ deliveryRunId: 999, user: { user_id: 12 } });

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_NOT_FOUND');
    });

    it('updates label/notes/status but refuses once dispatched', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        const useCase = buildUpdateDeliveryRunUseCase({
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const updated = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { label: 'Run A (Updated)', status: 'scheduled' },
            user: { user_id: 12 }
        }));
        expect(updated.success).toBe(true);
        expect(updated.data).toMatchObject({ label: 'Run A (Updated)', status: 'scheduled' });

        await deliveryRunRepository.updateRun(run.delivery_run_id, { status: 'dispatched' });
        const blocked = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: { label: 'Nope' },
            user: { user_id: 12 }
        }));
        expect(blocked.success).toBe(false);
        expect(blocked.error.details.reason_code).toBe('DELIVERY_RUN_LOCKED');
    });

    it('replaces the personnel roster and enforces exactly one accountable', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        const useCase = buildSetDeliveryRunPersonnelUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: {
                idempotency_key: 'set-personnel-001',
                personnel: [
                    { delivery_personnel_id: 21, is_accountable: true },
                    { delivery_personnel_name: 'Backup Rider', is_accountable: false }
                ]
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.run.personnel).toHaveLength(2);
        expect(result.data.run.personnel.find((row) => row.is_accountable)).toMatchObject({ delivery_personnel_id: 21 });
    });

    it('rejects a personnel set payload without exactly one accountable row', async () => {
        const harness = createDeliveryRunTestHarness();
        const { posRepository, deliveryRunRepository } = harness;
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        const useCase = buildSetDeliveryRunPersonnelUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: createLocationScopeResolver({ 12: 7 })
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: run.delivery_run_id,
            payload: {
                idempotency_key: 'set-personnel-002',
                personnel: [
                    { delivery_personnel_id: 21, is_accountable: false }
                ]
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });
});

// RF-1 fix (PR #1276 review): a POS user scoped to location A must never be able to list,
// retrieve, update, or set personnel on a run belonging to location B, even with a valid
// pos:view/pos:transact permission grant. Actor (user 12) is scoped to location 7 throughout;
// every run here belongs to location 8.
describe('Delivery run location scoping (PR #1276 RF-1)', () => {
    const actorUser = { user_id: 12 };
    const locationScopeResolver = () => createLocationScopeResolver({ 12: 7 });

    it('list excludes another location\'s runs even when requested by id', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const runB = await deliveryRunRepository.createRun({ label: 'Run B', location_id: 8, created_by: 99 });
        const useCase = buildListDeliveryRunsUseCase({
            deliveryRunRepository,
            resolveLocationScope: locationScopeResolver()
        });

        const scopedByActor = await useCase({ query: {}, user: actorUser });
        expect(scopedByActor.success).toBe(true);
        expect(scopedByActor.data.items.find((item) => item.delivery_run_id === runB.delivery_run_id)).toBeUndefined();

        const explicitCrossLocationRequest = await useCase({ query: { location_id: 8 }, user: actorUser });
        expect(explicitCrossLocationRequest.success).toBe(false);
        expect(explicitCrossLocationRequest.error.details.reason_code).toBe('POS_LOCATION_ACCESS_DENIED');
    });

    it('get denies retrieval of a run belonging to another location', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const runB = await deliveryRunRepository.createRun({ label: 'Run B', location_id: 8, created_by: 99 });
        const useCase = buildGetDeliveryRunUseCase({
            deliveryRunRepository,
            resolveLocationScope: locationScopeResolver()
        });

        const result = await useCase({ deliveryRunId: runB.delivery_run_id, user: actorUser });

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('POS_LOCATION_ACCESS_DENIED');
    });

    it('update denies mutating a run belonging to another location', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const runB = await deliveryRunRepository.createRun({ label: 'Run B', location_id: 8, created_by: 99 });
        const useCase = buildUpdateDeliveryRunUseCase({
            deliveryRunRepository,
            resolveLocationScope: locationScopeResolver()
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: runB.delivery_run_id,
            payload: { label: 'Hijacked' },
            user: actorUser
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('POS_LOCATION_ACCESS_DENIED');
        const untouched = await deliveryRunRepository.getRunById(runB.delivery_run_id);
        expect(untouched.label).toBe('Run B');
    });

    it('set-personnel denies replacing the roster on a run belonging to another location', async () => {
        const { posRepository, deliveryRunRepository } = createDeliveryRunTestHarness();
        const runB = await deliveryRunRepository.createRun({ label: 'Run B', location_id: 8, created_by: 99 });
        const useCase = buildSetDeliveryRunPersonnelUseCase({
            posRepository,
            deliveryRunRepository,
            resolveLocationScope: locationScopeResolver()
        });

        const result = await runInTenantContext(() => useCase({
            deliveryRunId: runB.delivery_run_id,
            payload: {
                idempotency_key: 'cross-location-set-personnel',
                personnel: [{ delivery_personnel_id: 21, is_accountable: true }]
            },
            user: actorUser
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('POS_LOCATION_ACCESS_DENIED');
        expect(await deliveryRunRepository.listRunPersonnel(runB.delivery_run_id)).toHaveLength(0);
    });
});

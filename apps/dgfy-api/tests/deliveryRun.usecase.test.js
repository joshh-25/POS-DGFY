import { describe, expect, it, jest } from '@jest/globals';
import {
    buildCreateDeliveryRunUseCase,
    buildListDeliveryRunsUseCase,
    buildGetDeliveryRunUseCase,
    buildUpdateDeliveryRunUseCase,
    buildSetDeliveryRunPersonnelUseCase
} from '../src/modules/pos/usecases/deliveryRunUseCases.js';
import { createDeliveryRunTestHarness, runInTenantContext } from './testHelpers/deliveryRunTestHarness.js';

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

        const useCase = buildListDeliveryRunsUseCase({ deliveryRunRepository });
        const result = await useCase({ query: {} });

        expect(result.success).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items[0]).toMatchObject({ delivery_run_id: run.delivery_run_id, member_count: 1 });
    });

    it('returns 404 for a missing run on get', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const useCase = buildGetDeliveryRunUseCase({ deliveryRunRepository });

        const result = await useCase({ deliveryRunId: 999 });

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_RUN_NOT_FOUND');
    });

    it('updates label/notes/status but refuses once dispatched', async () => {
        const { deliveryRunRepository } = createDeliveryRunTestHarness();
        const run = await deliveryRunRepository.createRun({ label: 'Run A', location_id: 7, created_by: 12 });
        const useCase = buildUpdateDeliveryRunUseCase({ deliveryRunRepository });

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
        const useCase = buildSetDeliveryRunPersonnelUseCase({ posRepository, deliveryRunRepository });

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
        const useCase = buildSetDeliveryRunPersonnelUseCase({ posRepository, deliveryRunRepository });

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

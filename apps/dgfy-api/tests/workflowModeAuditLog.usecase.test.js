import { jest } from '@jest/globals';
import {
    applyWorkflowModeAuditLog,
    listWorkflowModeChangeLogs,
    resolveWorkflowModeAuditBeforeValues,
    touchesWorkflowModeAuditedSetting
} from '../src/modules/settings/usecases/workflowModeAuditLog.js';
import dbStore from '../src/utils/dbStore.js';

describe('workflow mode audit log (issue #178 phase 5)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('logs an actual ops_workflow_mode change with actor and from/to', async () => {
        const createMock = jest.fn().mockResolvedValue({ workflow_mode_change_log_id: 1 });
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { create: createMock } : null
        ));

        await applyWorkflowModeAuditLog({
            settingsData: { ops_workflow_mode: 'retail' },
            beforeValues: { ops_workflow_mode: 'services', ops_enabled_capabilities: null },
            actorUser: { user_id: 9, username: 'master_admin' }
        });

        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            actor_user_id: 9,
            actor_username_snapshot: 'master_admin',
            from_workflow_mode: 'services',
            to_workflow_mode: 'retail'
        }));
    });

    it('logs an ops_enabled_capabilities change even when the base mode is untouched', async () => {
        const createMock = jest.fn().mockResolvedValue({});
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { create: createMock } : null
        ));

        await applyWorkflowModeAuditLog({
            settingsData: { ops_enabled_capabilities: ['services'] },
            beforeValues: { ops_workflow_mode: 'retail', ops_enabled_capabilities: [] },
            actorUser: { user_id: 9 }
        });

        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            from_workflow_mode: 'retail',
            to_workflow_mode: 'retail',
            from_enabled_capabilities: [],
            to_enabled_capabilities: ['services']
        }));
    });

    it('does not log when the resubmitted value is unchanged (change log, not access log)', async () => {
        const createMock = jest.fn();
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { create: createMock } : null
        ));

        await applyWorkflowModeAuditLog({
            settingsData: { ops_workflow_mode: 'retail' },
            beforeValues: { ops_workflow_mode: 'retail' },
            actorUser: { user_id: 9 }
        });
        await applyWorkflowModeAuditLog({
            settingsData: { ops_enabled_capabilities: ['services'] },
            beforeValues: { ops_enabled_capabilities: ['services'] },
            actorUser: { user_id: 9 }
        });

        expect(createMock).not.toHaveBeenCalled();
    });

    it('ignores an unrelated capabilities array reorder (order-insensitive comparison)', async () => {
        const createMock = jest.fn();
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { create: createMock } : null
        ));

        await applyWorkflowModeAuditLog({
            settingsData: { ops_enabled_capabilities: ['inventory', 'services'] },
            beforeValues: { ops_enabled_capabilities: ['services', 'inventory'] },
            actorUser: { user_id: 9 }
        });

        expect(createMock).not.toHaveBeenCalled();
    });

    it('does nothing when settingsData touches neither key', async () => {
        const createMock = jest.fn();
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { create: createMock } : null
        ));

        const result = await applyWorkflowModeAuditLog({
            settingsData: { pos_business_name: 'New Name' },
            beforeValues: {},
            actorUser: { user_id: 9 }
        });

        expect(result).toBeNull();
        expect(createMock).not.toHaveBeenCalled();
    });

    it('logs a store_delivery_fee_mode change with actor and from/to (issue #1327)', async () => {
        const createMock = jest.fn().mockResolvedValue({ workflow_mode_change_log_id: 2 });
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { create: createMock } : null
        ));

        await applyWorkflowModeAuditLog({
            settingsData: { store_delivery_fee_mode: 'flat' },
            beforeValues: { store_delivery_fee_mode: 'distance_based' },
            actorUser: { user_id: 9, username: 'master_admin' }
        });

        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            actor_user_id: 9,
            actor_username_snapshot: 'master_admin',
            from_store_delivery_fee_mode: 'distance_based',
            to_store_delivery_fee_mode: 'flat'
        }));
    });

    it('logs a store_delivery_fee_calc blob change even when the mode is untouched (issue #1327)', async () => {
        const createMock = jest.fn().mockResolvedValue({});
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { create: createMock } : null
        ));

        await applyWorkflowModeAuditLog({
            settingsData: { store_delivery_fee_calc: { flat_amount: 75 } },
            beforeValues: { store_delivery_fee_calc: { flat_amount: 50 } },
            actorUser: { user_id: 9 }
        });

        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            from_store_delivery_fee_calc: { flat_amount: 50 },
            to_store_delivery_fee_calc: { flat_amount: 75 }
        }));
    });

    it('does not log a no-op re-save of store_delivery_fee_mode/calc (issue #1327 acceptance evidence)', async () => {
        const createMock = jest.fn();
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { create: createMock } : null
        ));

        await applyWorkflowModeAuditLog({
            settingsData: { store_delivery_fee_mode: 'flat' },
            beforeValues: { store_delivery_fee_mode: 'flat' },
            actorUser: { user_id: 9 }
        });
        await applyWorkflowModeAuditLog({
            settingsData: { store_delivery_fee_calc: { flat_amount: 50 } },
            beforeValues: { store_delivery_fee_calc: { flat_amount: 50 } },
            actorUser: { user_id: 9 }
        });

        expect(createMock).not.toHaveBeenCalled();
    });

    describe('resolveWorkflowModeAuditBeforeValues / touchesWorkflowModeAuditedSetting (issue #1327)', () => {
        it('fetches all audited keys, including the new delivery-fee pair, when one is touched', async () => {
            const getSettingsByKeysMock = jest.fn().mockResolvedValue({
                store_delivery_fee_mode: { value: 'distance_based' }
            });

            const before = await resolveWorkflowModeAuditBeforeValues({
                settingsRepository: { getSettingsByKeys: getSettingsByKeysMock },
                settingsData: { store_delivery_fee_mode: 'flat' }
            });

            expect(getSettingsByKeysMock).toHaveBeenCalledWith(expect.arrayContaining([
                'ops_workflow_mode',
                'store_delivery_fee_mode',
                'store_delivery_fee_calc'
            ]));
            expect(before).toEqual(expect.objectContaining({
                store_delivery_fee_mode: 'distance_based',
                store_delivery_fee_calc: null
            }));
        });

        it('skips the DB round-trip entirely for an untouched settings write', async () => {
            const getSettingsByKeysMock = jest.fn();

            const before = await resolveWorkflowModeAuditBeforeValues({
                settingsRepository: { getSettingsByKeys: getSettingsByKeysMock },
                settingsData: { pos_business_name: 'New Name' }
            });

            expect(getSettingsByKeysMock).not.toHaveBeenCalled();
            expect(before).toEqual({});
            expect(touchesWorkflowModeAuditedSetting({ pos_business_name: 'New Name' })).toBe(false);
            expect(touchesWorkflowModeAuditedSetting({ store_delivery_fee_calc: {} })).toBe(true);
        });
    });

    it('lists logs newest-first with a bounded limit', async () => {
        const findAllMock = jest.fn().mockResolvedValue([
            { get: () => ({ workflow_mode_change_log_id: 2 }) },
            { get: () => ({ workflow_mode_change_log_id: 1 }) }
        ]);
        jest.spyOn(dbStore, 'get').mockImplementation((name) => (
            name === 'WorkflowModeChangeLog' ? { findAll: findAllMock } : null
        ));

        const rows = await listWorkflowModeChangeLogs({ limit: 500 });

        expect(findAllMock).toHaveBeenCalledWith(expect.objectContaining({
            order: [['created_at', 'DESC']],
            limit: 200
        }));
        expect(rows).toEqual([
            { workflow_mode_change_log_id: 2 },
            { workflow_mode_change_log_id: 1 }
        ]);
    });
});

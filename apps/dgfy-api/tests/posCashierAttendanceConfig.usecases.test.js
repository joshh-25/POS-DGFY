import { describe, expect, it, jest } from '@jest/globals';
import { createPosCashierAttendanceConfigUseCases } from '../src/modules/pos/usecases/posCashierAttendanceConfigUseCases.js';

const makeSetting = (config = { enabled: false, location_ids: [] }) => ({
    setting_id: 7,
    setting_value: JSON.stringify(config),
    updated_at: new Date('2026-08-25T00:00:00.000Z'),
    get(key) { return this[key]; },
    async update(payload) {
        Object.assign(this, payload, { updated_at: new Date('2026-08-25T00:01:00.000Z') });
        return this;
    }
});

const makeRepository = ({ setting = null, locations, blockers = [] } = {}) => {
    let currentSetting = setting;
    const repository = {
        audits: [],
        saves: 0,
        async getSetting() { return currentSetting; },
        async ensureSetting() {
            currentSetting = makeSetting();
            return { setting: currentSetting, created: true };
        },
        async listActiveLocations() {
            return locations || [
                { location_id: 1, name: 'Main', is_active: true },
                { location_id: 2, name: 'Relief', is_active: true }
            ];
        },
        async listLocationsByIds({ locationIds }) {
            const source = locations || [
                { location_id: 1, name: 'Main', is_active: true },
                { location_id: 2, name: 'Relief', is_active: true }
            ];
            return source.filter((location) => locationIds.includes(location.location_id));
        },
        async findActiveWorkflowBlockers() { return blockers; },
        async saveSetting({ setting: target, config }) {
            repository.saves += 1;
            await target.update({ setting_value: JSON.stringify(config), data_type: 'json' });
            return target;
        },
        async createAudit({ payload }) { repository.audits.push(payload); },
        async transaction(callback) { return callback({ LOCK: { UPDATE: 'UPDATE' } }); }
    };
    return repository;
};

const admin = { user_id: 10, username: 'admin' };

describe('POS cashier attendance tenant configuration', () => {
    it('defaults to disabled and returns only active tenant locations', async () => {
        const repository = makeRepository();
        const useCases = createPosCashierAttendanceConfigUseCases({ repository });

        const result = await useCases.getConfig();

        expect(result.success).toBe(true);
        expect(result.data.config).toEqual({ enabled: false, location_ids: [] });
        expect(result.data.revision).toBeNull();
        expect(result.data.active_locations.map((location) => location.location_id)).toEqual([1, 2]);
    });

    it('enables selected active locations and writes immutable actor/request audit evidence', async () => {
        const repository = makeRepository();
        const useCases = createPosCashierAttendanceConfigUseCases({ repository });

        const result = await useCases.updateConfig({
            payload: { enabled: true, location_ids: [2, 1], revision: null },
            user: admin,
            request: { requestId: 'request-config-001', ipAddress: '127.0.0.1', userAgent: 'jest' }
        });

        expect(result.success).toBe(true);
        expect(result.data.config).toEqual({ enabled: true, location_ids: [1, 2] });
        expect(result.data.revision).toMatch(/^[a-f0-9]{64}$/);
        expect(repository.saves).toBe(1);
        expect(repository.audits).toHaveLength(1);
        expect(repository.audits[0]).toMatchObject({
            user_id: 10,
            event_type: 'pos_cashier_attendance_config_changed',
            request_id: 'request-config-001',
            changes: {
                previous: { enabled: false, location_ids: [] },
                resulting: { enabled: true, location_ids: [1, 2] },
                affected_location_ids: [1, 2]
            }
        });
    });

    it('rejects invalid or inactive tenant locations without a partial setting write', async () => {
        const repository = makeRepository({
            locations: [
                { location_id: 1, name: 'Main', is_active: true },
                { location_id: 2, name: 'Inactive', is_active: false }
            ]
        });
        const useCases = createPosCashierAttendanceConfigUseCases({ repository });

        const result = await useCases.updateConfig({
            payload: { enabled: true, location_ids: [1, 2, 999], revision: null },
            user: admin
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('POS_ATTENDANCE_CONFIG_INVALID_LOCATION');
        expect(result.error.details.invalid_location_ids).toEqual([2, 999]);
        expect(repository.saves).toBe(0);
        expect(repository.audits).toHaveLength(0);
    });

    it('fails closed with actionable blockers while an affected workflow is active', async () => {
        const setting = makeSetting({ enabled: true, location_ids: [1] });
        const repository = makeRepository({
            setting,
            blockers: [{ type: 'open_register_shift', location_id: 1, terminal_id: 'COUNTER-01', record_id: 41 }]
        });
        const useCases = createPosCashierAttendanceConfigUseCases({ repository });
        const current = await useCases.getConfig();

        const result = await useCases.updateConfig({
            payload: { enabled: false, location_ids: [], revision: current.data.revision },
            user: admin
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('POS_ATTENDANCE_CONFIG_ACTIVE_WORKFLOW');
        expect(result.error.details.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'open_register_shift', location_id: 1 })
        ]));
        expect(repository.saves).toBe(0);
    });

    it('rejects stale concurrent saves before validating or writing the new value', async () => {
        const repository = makeRepository({ setting: makeSetting({ enabled: true, location_ids: [1] }) });
        repository.findActiveWorkflowBlockers = jest.fn();
        const useCases = createPosCashierAttendanceConfigUseCases({ repository });

        const result = await useCases.updateConfig({
            payload: { enabled: false, location_ids: [], revision: '0'.repeat(64) },
            user: admin
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('POS_ATTENDANCE_CONFIG_STALE_REVISION');
        expect(repository.findActiveWorkflowBlockers).not.toHaveBeenCalled();
        expect(repository.saves).toBe(0);
    });

    it('rejects a concurrent first write that creates the setting after the initial read', async () => {
        const repository = makeRepository();
        repository.ensureSetting = async () => ({
            setting: makeSetting({ enabled: true, location_ids: [2] }),
            created: false
        });
        const useCases = createPosCashierAttendanceConfigUseCases({ repository });

        const result = await useCases.updateConfig({
            payload: { enabled: true, location_ids: [1], revision: null },
            user: admin
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('POS_ATTENDANCE_CONFIG_STALE_REVISION');
        expect(repository.saves).toBe(0);
        expect(repository.audits).toHaveLength(0);
    });
});

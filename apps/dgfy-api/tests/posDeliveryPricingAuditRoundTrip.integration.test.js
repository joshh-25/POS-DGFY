import dbStore from '../src/utils/dbStore.js';
import { settingsRepository } from '../src/modules/settings/repositories/settingsRepository.js';
import { buildUpdateSettingsUseCase } from '../src/modules/settings/usecases/updateSettingsUseCase.js';
import { buildGetAllSettingsUseCase } from '../src/modules/settings/usecases/getAllSettingsUseCase.js';

// #1341 (PR #1342, reviewer finding RF-2): the shipped unit tests
// (packages/web-core/src/features/pos/__tests__/PosDeliveryPricingSettingsCard.behavior.test.jsx)
// only assert the frontend PUT payload shape. This proves the cross-surface round-trip those
// unit tests can't: a POS-shaped settings write, run through the REAL production
// updateSettingsUseCase (not a mock of it), actually appends a #1327 workflow_mode_change_log
// row carrying the actor and before/after values, AND that the new value is then readable back
// through getAllSettingsUseCase -- the exact same use case apps/dgfy-ims/Pages/Settings.jsx's own
// GET /settings call resolves to (there is no POS-specific or IMS-specific read path; see
// apps/dgfy-api/src/modules/settings/controllers/settingsHandlers.js).
//
// This is deliberately NOT a `*.db.integration.test.js` (this repo's existing naming for a real
// MySQL-backed test, e.g. billingScheduler.db.integration.test.js) -- no live database is used.
// Instead it wires the real settingsRepository singleton (unmodified production code, which calls
// dbStore.get('SystemSetting') / dbStore.get('WorkflowModeChangeLog') internally, exactly as it
// does against a live tenant connection) against a minimal in-memory Sequelize-shaped fake model,
// supplied the same way apps/dgfy-api/src/middleware/tenantHandler.js supplies real tenant models
// per request: dbStore.run({ SystemSetting, WorkflowModeChangeLog }, callback). That is the actual
// seam between "the two settings use cases" and "the DB row" -- exercising real
// updateSettingsUseCase -> real applyWorkflowModeAuditLog -> real settingsRepository logic against
// a fake table is a stronger proof of the wiring than re-testing applyWorkflowModeAuditLog in
// isolation (already covered by workflowModeAuditLog.usecase.test.js) or than hand-rolling a fake
// settingsRepository that could silently drift from what the real one actually does.

const createFakeSystemSettingModel = (seedRows = []) => {
    let nextId = 1;
    const rows = seedRows.map((row) => ({ setting_id: nextId += 1, updated_at: new Date('2026-08-01T00:00:00Z'), ...row }));

    const wrap = (row) => new Proxy(row, {
        get(target, prop) {
            if (prop === 'update') {
                return async (patch) => {
                    Object.assign(target, patch, { updated_at: new Date() });
                    return target;
                };
            }
            return target[prop];
        }
    });

    return {
        rows,
        async findAll(query = {}) {
            const inClause = query?.where?.setting_key;
            const inKeys = inClause && typeof inClause === 'object' ? Object.values(inClause)[0] : null;
            const matched = Array.isArray(inKeys) ? rows.filter((row) => inKeys.includes(row.setting_key)) : rows;
            return matched.map(wrap);
        },
        async findOne({ where: { setting_key } }) {
            const row = rows.find((entry) => entry.setting_key === setting_key);
            return row ? wrap(row) : null;
        },
        async create(data) {
            const row = { setting_id: nextId += 1, updated_at: new Date(), ...data };
            rows.push(row);
            return wrap(row);
        }
    };
};

const createFakeWorkflowModeChangeLogModel = () => {
    const rows = [];
    return {
        rows,
        async create(data) {
            const row = { workflow_mode_change_log_id: rows.length + 1, created_at: new Date(), ...data };
            rows.push(row);
            return row;
        }
    };
};

const seedDeliveryPricingSettings = () => createFakeSystemSettingModel([
    { setting_key: 'store_delivery_fee', setting_value: '75', data_type: 'number', description: 'seed' },
    { setting_key: 'store_delivery_fee_mode', setting_value: 'fixed', data_type: 'string', description: 'seed' }
]);

describe('POS-originated delivery-pricing settings write -> audit row -> IMS read (#1341 PR #1342 RF-2)', () => {
    it('creates a workflow_mode_change_log row with actor + before/after, then reads back through the IMS-shared settings path', async () => {
        const systemSettingModel = seedDeliveryPricingSettings();
        const workflowModeChangeLogModel = createFakeWorkflowModeChangeLogModel();
        const updateSettingsUseCase = buildUpdateSettingsUseCase({ settingsRepository });
        const getAllSettingsUseCase = buildGetAllSettingsUseCase({ settingsRepository });

        // Shaped exactly like PosDeliveryPricingSettingsCard.jsx's own handleSave payload for a
        // switch to calculated mode with a fully-populated formula (see the "shows the
        // calculated-mode formula fields..." case in the frontend behavior test this finding
        // cites) -- store_delivery_fee_mode is always sent, store_delivery_fee_calc only when a
        // complete formula is present.
        const posActor = { user_id: 501, username: 'pos-terminal-admin@example.test', is_master_admin: false };
        const calcFormula = { min_fee: 50, included_km: 3, per_km_rate: 10, increment_km: 0.5, max_distance_km: 15 };

        const saveResult = await dbStore.run(
            { SystemSetting: systemSettingModel, WorkflowModeChangeLog: workflowModeChangeLogModel },
            () => updateSettingsUseCase({
                settingsData: {
                    store_delivery_fee: 120,
                    store_delivery_fee_mode: 'calculated',
                    store_delivery_fee_calc: calcFormula
                },
                actorUser: posActor
            })
        );

        expect(saveResult.success).toBe(true);

        // Audit row proof: actor + real before/after values, written by the real use case.
        expect(workflowModeChangeLogModel.rows).toHaveLength(1);
        expect(workflowModeChangeLogModel.rows[0]).toEqual(expect.objectContaining({
            actor_user_id: 501,
            actor_username_snapshot: 'pos-terminal-admin@example.test',
            from_store_delivery_fee_mode: 'fixed',
            to_store_delivery_fee_mode: 'calculated',
            from_store_delivery_fee_calc: null,
            to_store_delivery_fee_calc: calcFormula
        }));

        // IMS-path readback proof: getAllSettingsUseCase is the exact use case behind GET
        // /settings for both apps -- no POS-specific read path exists to have silently diverged.
        const readResult = await dbStore.run(
            { SystemSetting: systemSettingModel },
            () => getAllSettingsUseCase({})
        );

        expect(readResult.success).toBe(true);
        expect(readResult.data.store_delivery_fee.value).toBe(120);
        expect(readResult.data.store_delivery_fee_mode.value).toBe('calculated');
        expect(readResult.data.store_delivery_fee_calc.value).toEqual(calcFormula);
    });

    // Disclosed, not silently assumed: AUDITED_SETTING_KEYS
    // (apps/dgfy-api/src/modules/settings/usecases/workflowModeAuditLog.js) covers
    // store_delivery_fee_mode and store_delivery_fee_calc (added by #1327/Phase 234, already
    // shipped before this PR) but never store_delivery_fee itself -- the flat peso amount. This
    // is pre-existing #1327 scope, not something this PR introduces or is asked to fix, but RF-2
    // asked for proof of what the audited write actually covers, and an honest answer has to
    // include what it does not. Filed as a follow-up rather than fixed ad hoc mid-review (see the
    // PR reply for the issue link).
    it('disclosed gap: changing only the flat delivery fee amount writes no audit row (store_delivery_fee is not an audited key)', async () => {
        const systemSettingModel = seedDeliveryPricingSettings();
        const workflowModeChangeLogModel = createFakeWorkflowModeChangeLogModel();
        const updateSettingsUseCase = buildUpdateSettingsUseCase({ settingsRepository });
        const getAllSettingsUseCase = buildGetAllSettingsUseCase({ settingsRepository });

        // Mirrors the "saves a fixed-mode change without a calc key" frontend case: mode is
        // resubmitted unchanged (still 'fixed'), only the peso amount actually changes.
        const saveResult = await dbStore.run(
            { SystemSetting: systemSettingModel, WorkflowModeChangeLog: workflowModeChangeLogModel },
            () => updateSettingsUseCase({
                settingsData: { store_delivery_fee: 200, store_delivery_fee_mode: 'fixed' },
                actorUser: { user_id: 501, username: 'pos-terminal-admin@example.test', is_master_admin: false }
            })
        );

        expect(saveResult.success).toBe(true);
        // The write itself succeeded and is readable -- only the audit row is missing.
        const readResult = await dbStore.run(
            { SystemSetting: systemSettingModel },
            () => getAllSettingsUseCase({})
        );
        expect(readResult.data.store_delivery_fee.value).toBe(200);
        expect(workflowModeChangeLogModel.rows).toHaveLength(0);
    });
});

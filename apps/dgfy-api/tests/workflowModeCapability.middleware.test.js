import { jest } from '@jest/globals';

const settingsMock = jest.fn();
const resolveStoreProfileMock = jest.fn();

jest.unstable_mockModule('../src/modules/shared/utils/workflowCapabilitySettingsCache.js', () => ({
    resolveWorkflowCapabilitySettings: settingsMock
}));

jest.unstable_mockModule('../src/modules/settings/usecases/resolveStoreProfile.js', () => ({
    resolveStoreProfile: resolveStoreProfileMock
}));

const { requireWorkflowCapability } = await import('../src/middleware/workflowModeCapability.js');

const createResponse = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('requireWorkflowCapability (issue #178 Phase 19 - fail-closed gate)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('grants access via the registry path when the flag is off and the capability is present', async () => {
        settingsMock.mockResolvedValue({
            mode: 'fnb',
            enabledCapabilities: [],
            disabledCapabilities: [],
            readFlagEnabled: false
        });
        const req = {};
        const res = createResponse();
        const next = jest.fn();

        await requireWorkflowCapability('tableService', 'Tables')(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
        expect(req.workflowMode).toBe('fnb');
        expect(resolveStoreProfileMock).not.toHaveBeenCalled();
    });

    it('denies (403) via the registry path when the flag is off and a base-mode capability has been disabled (issue #178 Phase 16)', async () => {
        settingsMock.mockResolvedValue({
            mode: 'fnb',
            enabledCapabilities: [],
            disabledCapabilities: ['tableService'],
            readFlagEnabled: false
        });
        const req = {};
        const res = createResponse();
        const next = jest.fn();

        await requireWorkflowCapability('tableService', 'Tables')(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error_code: 'WORKFLOW_MODE_CAPABILITY_DENIED'
        }));
        expect(resolveStoreProfileMock).not.toHaveBeenCalled();
    });

    it('denies a capability the base mode never grants, flag off', async () => {
        settingsMock.mockResolvedValue({
            mode: 'retail',
            enabledCapabilities: [],
            disabledCapabilities: [],
            readFlagEnabled: false
        });
        const req = {};
        const res = createResponse();
        const next = jest.fn();

        await requireWorkflowCapability('services', 'Services')(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('grants access via the resolver path when the flag is on and the profile contains the capability', async () => {
        settingsMock.mockResolvedValue({
            mode: 'fnb',
            enabledCapabilities: [],
            disabledCapabilities: ['tableService'],
            readFlagEnabled: true
        });
        resolveStoreProfileMock.mockResolvedValue({
            profile: { modules: ['catalog', 'fnbDining', 'inventory', 'kitchenQueue', 'menuModifiers', 'pos', 'storefront'] },
            source: 'persisted',
            diverged: false
        });
        const req = {};
        const res = createResponse();
        const next = jest.fn();

        await requireWorkflowCapability('kitchenQueue', 'Kitchen')(req, res, next);

        expect(resolveStoreProfileMock).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('denies via the resolver path when the flag is on and the profile does not contain the capability (subtraction actually enforced)', async () => {
        settingsMock.mockResolvedValue({
            mode: 'fnb',
            enabledCapabilities: [],
            disabledCapabilities: ['tableService', 'kitchenQueue', 'restaurantServiceCharge'],
            readFlagEnabled: true
        });
        resolveStoreProfileMock.mockResolvedValue({
            profile: { modules: ['catalog', 'fnbDining', 'inventory', 'menuModifiers', 'pos', 'storefront'] },
            source: 'rebuilt',
            diverged: false
        });
        const req = {};
        const res = createResponse();
        const next = jest.fn();

        await requireWorkflowCapability('tableService', 'Tables')(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('fails closed (never grants) when the settings resolver throws', async () => {
        settingsMock.mockRejectedValue(new Error('SystemSetting query failed'));
        const req = {};
        const res = createResponse();
        const next = jest.fn();

        await requireWorkflowCapability('pos', 'POS')(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('fails closed (never grants) when the Store Profile resolver throws with the flag on', async () => {
        settingsMock.mockResolvedValue({
            mode: 'fnb',
            enabledCapabilities: [],
            disabledCapabilities: [],
            readFlagEnabled: true
        });
        resolveStoreProfileMock.mockRejectedValue(new Error('landlord DB unavailable'));
        const req = {};
        const res = createResponse();
        const next = jest.fn();

        await requireWorkflowCapability('pos', 'POS')(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    });
});

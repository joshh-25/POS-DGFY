import { jest } from '@jest/globals';

const mockGetMobilePosCatalogBootstrapUseCase = jest.fn();
const mockGetMobilePosSettingsBootstrapUseCase = jest.fn();
const mockGetMobilePosDevicePolicyUseCase = jest.fn();
const mockSyncMobilePosCheckoutsUseCase = jest.fn();
const mockGetMobilePosTransactionCheckpointUseCase = jest.fn();
const mockSyncMobilePosVoidsUseCase = jest.fn();
const mockSyncMobilePosOrderActionsUseCase = jest.fn();
const mockSyncMobilePosItemsUseCase = jest.fn();
const mockSyncMobilePosShiftsUseCase = jest.fn();
const mockSyncMobilePosHardwareEventsUseCase = jest.fn();
const mockAcknowledgeMobilePosCheckpointUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/pos/index.js', () => ({
    getMobilePosCatalogBootstrapUseCase: mockGetMobilePosCatalogBootstrapUseCase,
    getMobilePosSettingsBootstrapUseCase: mockGetMobilePosSettingsBootstrapUseCase,
    getMobilePosDevicePolicyUseCase: mockGetMobilePosDevicePolicyUseCase,
    syncMobilePosCheckoutsUseCase: mockSyncMobilePosCheckoutsUseCase,
    getMobilePosTransactionCheckpointUseCase: mockGetMobilePosTransactionCheckpointUseCase,
    syncMobilePosVoidsUseCase: mockSyncMobilePosVoidsUseCase,
    syncMobilePosOrderActionsUseCase: mockSyncMobilePosOrderActionsUseCase,
    syncMobilePosItemsUseCase: mockSyncMobilePosItemsUseCase,
    syncMobilePosShiftsUseCase: mockSyncMobilePosShiftsUseCase,
    syncMobilePosHardwareEventsUseCase: mockSyncMobilePosHardwareEventsUseCase,
    acknowledgeMobilePosCheckpointUseCase: mockAcknowledgeMobilePosCheckpointUseCase
}));

let getCatalogBootstrap;
let getSettingsBootstrap;
let getDevicePolicy;
let syncCheckouts;
let syncItems;
let syncShifts;
let syncHardwareEvents;
let syncOrderActions;
let acknowledgeCheckpoint;

beforeAll(async () => {
    const mod = await import('../src/modules/pos/controllers/mobilePosHandlers.js');
    getCatalogBootstrap = mod.getCatalogBootstrap;
    getSettingsBootstrap = mod.getSettingsBootstrap;
    getDevicePolicy = mod.getDevicePolicy;
    syncCheckouts = mod.syncCheckouts;
    syncItems = mod.syncItems;
    syncShifts = mod.syncShifts;
    syncHardwareEvents = mod.syncHardwareEvents;
    syncOrderActions = mod.syncOrderActions;
    acknowledgeCheckpoint = mod.acknowledgeCheckpoint;
});

const createRes = () => {
    const res = {
        locals: {},
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
};

describe('mobilePosHandlers transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('getCatalogBootstrap returns stable success payload', async () => {
        mockGetMobilePosCatalogBootstrapUseCase.mockResolvedValue({
            success: true,
            data: {
                generated_at: '2026-06-19T00:00:00.000Z',
                bootstrap_version: 'mobile-pos.v1',
                catalog: [{ item_id: 1, item_name: 'Tea' }]
            }
        });

        const req = {
            validatedQuery: { search: '', limit: 100, location_id: 3 },
            query: {},
            user: { user_id: 7, tenant_id: 'tenant-1' },
            requestId: 'req-mobile-catalog'
        };
        const res = createRes();
        const next = jest.fn();

        await getCatalogBootstrap(req, res, next);

        expect(mockGetMobilePosCatalogBootstrapUseCase).toHaveBeenCalledWith({
            query: { search: '', limit: 100, location_id: 3 },
            user: expect.objectContaining({ user_id: 7 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                bootstrap_version: 'mobile-pos.v1'
            }),
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('getSettingsBootstrap returns stable success payload', async () => {
        mockGetMobilePosSettingsBootstrapUseCase.mockResolvedValue({
            success: true,
            data: {
                settings: { pos_business_name: 'DGFY POS' },
                sync_policy: { successful_full_syncs_per_day: 2 }
            }
        });

        const req = { requestId: 'req-mobile-settings' };
        const res = createRes();
        const next = jest.fn();

        await getSettingsBootstrap(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                sync_policy: expect.objectContaining({ successful_full_syncs_per_day: 2 })
            }),
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('getDevicePolicy returns stable success payload', async () => {
        mockGetMobilePosDevicePolicyUseCase.mockResolvedValue({
            success: true,
            data: {
                terminal_policy: { registry_mode: 'enforced' },
                sync_policy: { successful_full_syncs_per_day: 2 }
            }
        });

        const req = { requestId: 'req-mobile-device-policy' };
        const res = createRes();
        const next = jest.fn();

        await getDevicePolicy(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                terminal_policy: expect.objectContaining({ registry_mode: 'enforced' })
            }),
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('syncCheckouts returns success message contract', async () => {
        mockSyncMobilePosCheckoutsUseCase.mockResolvedValue({
            success: true,
            data: {
                results: [{ local_transaction_id: 'tx-1', status: 'accepted' }],
                summary: { total_entries: 1, checkpoint_token: 'checkpoint-1' }
            }
        });

        const req = {
            validatedData: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'tx-1', payload: { idempotency_key: 'idem-1' } }]
            },
            body: {},
            user: { user_id: 7, tenant_id: 'tenant-1' },
            requestId: 'req-mobile-checkouts'
        };
        const res = createRes();
        const next = jest.fn();

        await syncCheckouts(req, res, next);

        expect(mockSyncMobilePosCheckoutsUseCase).toHaveBeenCalledWith({
            payload: expect.objectContaining({ device_id: 'IMIN-01' }),
            user: expect.objectContaining({ user_id: 7 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                summary: expect.objectContaining({ total_entries: 1 })
            }),
            message: 'Mobile POS checkout sync processed',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('syncItems returns success message contract', async () => {
        mockSyncMobilePosItemsUseCase.mockResolvedValue({
            success: true,
            data: {
                results: [{ local_transaction_id: 'prod-1', status: 'accepted', server_item_id: 42 }],
                summary: { total_entries: 1, accepted_count: 1, replayed_count: 0, rejected_count: 0 }
            }
        });

        const req = {
            validatedData: {
                device_id: 'IMIN-01',
                entries: [{ local_transaction_id: 'prod-1', payload: { op: 'create', sku_code: 'SKU-1', name: 'Item 1', category: 'product', max_capacity: 10, unit_of_measure: 'pcs' } }]
            },
            body: {},
            user: { user_id: 7, tenant_id: 'tenant-1' },
            requestId: 'req-mobile-items'
        };
        const res = createRes();
        const next = jest.fn();

        await syncItems(req, res, next);

        expect(mockSyncMobilePosItemsUseCase).toHaveBeenCalledWith({
            payload: expect.objectContaining({ device_id: 'IMIN-01' }),
            user: expect.objectContaining({ user_id: 7 })
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                summary: expect.objectContaining({ total_entries: 1, accepted_count: 1 })
            }),
            message: 'Mobile POS item sync processed',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('syncShifts returns success message contract', async () => {
        mockSyncMobilePosShiftsUseCase.mockResolvedValue({
            success: true,
            data: {
                results: [{ local_operation_id: 'shift-1', status: 'accepted' }],
                summary: { total_entries: 1, checkpoint_token: 'checkpoint-2' }
            }
        });

        const req = {
            validatedData: {
                device_id: 'IMIN-01',
                entries: [{ local_operation_id: 'shift-1', operation_type: 'shift_open', payload: { terminal_id: 'POS-01' } }]
            },
            body: {},
            user: { user_id: 7, tenant_id: 'tenant-1' },
            requestId: 'req-mobile-shifts'
        };
        const res = createRes();
        const next = jest.fn();

        await syncShifts(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                summary: expect.objectContaining({ total_entries: 1 })
            }),
            message: 'Mobile POS shift sync processed',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('syncHardwareEvents returns success message contract', async () => {
        mockSyncMobilePosHardwareEventsUseCase.mockResolvedValue({
            success: true,
            data: {
                results: [{ local_event_id: 'evt-1', status: 'accepted' }],
                summary: { total_entries: 1, checkpoint_token: 'checkpoint-3' }
            }
        });

        const req = {
            validatedData: {
                device_id: 'IMIN-01',
                entries: [{ local_event_id: 'evt-1', event_type: 'printer_error', payload: {} }]
            },
            body: {},
            user: { user_id: 7, tenant_id: 'tenant-1' },
            requestId: 'req-mobile-hardware'
        };
        const res = createRes();
        const next = jest.fn();

        await syncHardwareEvents(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                summary: expect.objectContaining({ total_entries: 1 })
            }),
            message: 'Mobile POS hardware event sync processed',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('syncOrderActions returns the stable replay result contract', async () => {
        mockSyncMobilePosOrderActionsUseCase.mockResolvedValue({
            success: true,
            data: { results: [{ local_operation_id: 'order-1', status: 'accepted' }], summary: { total_entries: 1 } }
        });
        const req = { validatedData: { device_id: 'IMIN-01', entries: [] }, body: {}, user: { user_id: 7 } };
        const res = createRes();
        const next = jest.fn();
        await syncOrderActions(req, res, next);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Mobile POS order action sync processed'
        }));
        expect(next).not.toHaveBeenCalled();
    });

    it('acknowledgeCheckpoint returns success message contract', async () => {
        mockAcknowledgeMobilePosCheckpointUseCase.mockResolvedValue({
            success: true,
            data: {
                acknowledged: true,
                checkpoint_token: 'checkpoint-4',
                sync_limit_policy: { successful_full_syncs_per_day: 2 }
            }
        });

        const req = {
            validatedData: { checkpoint_token: 'checkpoint-4' },
            body: {},
            user: { user_id: 7, tenant_id: 'tenant-1' },
            requestId: 'req-mobile-checkpoint'
        };
        const res = createRes();
        const next = jest.fn();

        await acknowledgeCheckpoint(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: expect.objectContaining({
                acknowledged: true,
                checkpoint_token: 'checkpoint-4'
            }),
            message: 'Mobile POS checkpoint acknowledged',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });
});

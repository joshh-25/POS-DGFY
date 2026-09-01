import fs from 'fs';
import path from 'path';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCreateDeliveryRunUseCase = jest.fn();
const mockListDeliveryRunsUseCase = jest.fn();
const mockGetDeliveryRunUseCase = jest.fn();
const mockUpdateDeliveryRunUseCase = jest.fn();
const mockSetDeliveryRunPersonnelUseCase = jest.fn();
const mockAddDeliveryRunMembersUseCase = jest.fn();
const mockRemoveDeliveryRunMemberUseCase = jest.fn();
const mockDispatchDeliveryRunUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/pos/index.js', () => ({
    createDeliveryRunUseCase: mockCreateDeliveryRunUseCase,
    listDeliveryRunsUseCase: mockListDeliveryRunsUseCase,
    getDeliveryRunUseCase: mockGetDeliveryRunUseCase,
    updateDeliveryRunUseCase: mockUpdateDeliveryRunUseCase,
    setDeliveryRunPersonnelUseCase: mockSetDeliveryRunPersonnelUseCase,
    addDeliveryRunMembersUseCase: mockAddDeliveryRunMembersUseCase,
    removeDeliveryRunMemberUseCase: mockRemoveDeliveryRunMemberUseCase,
    dispatchDeliveryRunUseCase: mockDispatchDeliveryRunUseCase
}));

let createDeliveryRun;
let listDeliveryRuns;
let getDeliveryRun;
let updateDeliveryRun;
let setDeliveryRunPersonnel;
let addDeliveryRunMembers;
let removeDeliveryRunMember;
let dispatchDeliveryRun;

beforeAll(async () => {
    const mod = await import('../src/modules/pos/controllers/deliveryRunHandlers.js');
    createDeliveryRun = mod.createDeliveryRun;
    listDeliveryRuns = mod.listDeliveryRuns;
    getDeliveryRun = mod.getDeliveryRun;
    updateDeliveryRun = mod.updateDeliveryRun;
    setDeliveryRunPersonnel = mod.setDeliveryRunPersonnel;
    addDeliveryRunMembers = mod.addDeliveryRunMembers;
    removeDeliveryRunMember = mod.removeDeliveryRunMember;
    dispatchDeliveryRun = mod.dispatchDeliveryRun;
});

const createReq = (overrides = {}) => ({
    validatedData: {},
    validatedParams: {},
    validatedQuery: {},
    body: {},
    params: {},
    query: {},
    user: { user_id: 12 },
    ip: '127.0.0.1',
    get: () => 'test-agent',
    ...overrides
});

const createRes = () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    return res;
};

describe('deliveryRunHandlers transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('createDeliveryRun returns the created run with a 201', async () => {
        mockCreateDeliveryRunUseCase.mockResolvedValue({
            success: true,
            data: { delivery_run_id: 1, label: 'Morning Run', status: 'draft' }
        });
        const req = createReq({ validatedData: { label: 'Morning Run' } });
        const res = createRes();
        const next = jest.fn();

        await createDeliveryRun(req, res, next);

        expect(mockCreateDeliveryRunUseCase).toHaveBeenCalledWith(expect.objectContaining({
            payload: { label: 'Morning Run' },
            user: req.user
        }));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            data: { delivery_run_id: 1, label: 'Morning Run', status: 'draft' }
        }));
        expect(next).not.toHaveBeenCalled();
    });

    it('listDeliveryRuns returns the paginated list contract', async () => {
        mockListDeliveryRunsUseCase.mockResolvedValue({
            success: true,
            data: { items: [], pagination: { total: 0, page: 1, limit: 20 } }
        });
        const req = createReq({ validatedQuery: { status: 'draft' } });
        const res = createRes();

        await listDeliveryRuns(req, res, jest.fn());

        expect(mockListDeliveryRunsUseCase).toHaveBeenCalledWith({ query: { status: 'draft' }, user: req.user });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('getDeliveryRun returns 404 through the shared error payload when not found', async () => {
        mockGetDeliveryRunUseCase.mockResolvedValue({
            success: false,
            error: { code: 'RESOURCE_NOT_FOUND', message: 'Delivery run was not found.', details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
        });
        const req = createReq({ validatedParams: { deliveryRunId: 999 } });
        const res = createRes();

        await getDeliveryRun(req, res, jest.fn());

        expect(mockGetDeliveryRunUseCase).toHaveBeenCalledWith({ deliveryRunId: 999, user: req.user });
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error_code: 'RESOURCE_NOT_FOUND'
        }));
    });

    it('updateDeliveryRun forwards params/body/user to the use case', async () => {
        mockUpdateDeliveryRunUseCase.mockResolvedValue({ success: true, data: { delivery_run_id: 1, status: 'scheduled' } });
        const req = createReq({ validatedParams: { deliveryRunId: 1 }, validatedData: { status: 'scheduled' } });
        const res = createRes();

        await updateDeliveryRun(req, res, jest.fn());

        expect(mockUpdateDeliveryRunUseCase).toHaveBeenCalledWith(expect.objectContaining({
            deliveryRunId: 1,
            payload: { status: 'scheduled' },
            user: req.user
        }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('setDeliveryRunPersonnel forwards the audit context', async () => {
        mockSetDeliveryRunPersonnelUseCase.mockResolvedValue({ success: true, data: { run: {} } });
        const req = createReq({
            validatedParams: { deliveryRunId: 1 },
            validatedData: { idempotency_key: 'set-personnel-transport-1', personnel: [] }
        });
        const res = createRes();

        await setDeliveryRunPersonnel(req, res, jest.fn());

        expect(mockSetDeliveryRunPersonnelUseCase).toHaveBeenCalledWith(expect.objectContaining({
            deliveryRunId: 1,
            auditContext: { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
        }));
    });

    it('addDeliveryRunMembers returns the added/skipped contract', async () => {
        mockAddDeliveryRunMembersUseCase.mockResolvedValue({
            success: true,
            data: { run: {}, added: [{ pos_transaction_id: 501 }], skipped: [] }
        });
        const req = createReq({
            validatedParams: { deliveryRunId: 1 },
            validatedData: { idempotency_key: 'add-members-transport-1', pos_transaction_ids: [501] }
        });
        const res = createRes();

        await addDeliveryRunMembers(req, res, jest.fn());

        expect(mockAddDeliveryRunMembersUseCase).toHaveBeenCalledWith(expect.objectContaining({ deliveryRunId: 1 }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            data: { run: {}, added: [{ pos_transaction_id: 501 }], skipped: [] }
        }));
    });

    it('removeDeliveryRunMember forwards both path params', async () => {
        mockRemoveDeliveryRunMemberUseCase.mockResolvedValue({
            success: true,
            data: { assignment_cleared: true, reason_code: null }
        });
        const req = createReq({ validatedParams: { deliveryRunId: 1, posTransactionId: 501 } });
        const res = createRes();

        await removeDeliveryRunMember(req, res, jest.fn());

        expect(mockRemoveDeliveryRunMemberUseCase).toHaveBeenCalledWith(expect.objectContaining({
            deliveryRunId: 1,
            posTransactionId: 501
        }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('dispatchDeliveryRun returns the dispatched/skipped/failed contract', async () => {
        mockDispatchDeliveryRunUseCase.mockResolvedValue({
            success: true,
            data: {
                run: {},
                dispatched: [{ pos_transaction_id: 501 }],
                skipped: [],
                failed: [],
                run_status: { previous: 'draft', current: 'dispatched', advanced: true }
            }
        });
        const req = createReq({
            validatedParams: { deliveryRunId: 1 },
            validatedData: { idempotency_key: 'dispatch-transport-1' }
        });
        const res = createRes();

        await dispatchDeliveryRun(req, res, jest.fn());

        expect(mockDispatchDeliveryRunUseCase).toHaveBeenCalledWith(expect.objectContaining({
            deliveryRunId: 1,
            payload: { idempotency_key: 'dispatch-transport-1' },
            auditContext: { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
        }));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            data: expect.objectContaining({
                dispatched: [{ pos_transaction_id: 501 }],
                run_status: { previous: 'draft', current: 'dispatched', advanced: true }
            })
        }));
    });
});

describe('delivery run route registration (Phase 225)', () => {
    const routeSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/routes/pos.js'),
        'utf8'
    );

    it('exposes the 8 delivery run endpoints with pos:transact/pos:view permissions', () => {
        expect(routeSource).toContain("router.post('/delivery-runs', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunCreate, deliveryRunController.createDeliveryRun);");
        expect(routeSource).toContain("router.get('/delivery-runs', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateDeliveryRunListQuery, deliveryRunController.listDeliveryRuns);");
        expect(routeSource).toContain("router.get('/delivery-runs/:deliveryRunId', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateDeliveryRunIdParam, deliveryRunController.getDeliveryRun);");
        expect(routeSource).toContain("router.patch('/delivery-runs/:deliveryRunId', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunIdParam, validateDeliveryRunUpdate, deliveryRunController.updateDeliveryRun);");
        expect(routeSource).toContain("router.put('/delivery-runs/:deliveryRunId/personnel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunIdParam, validateDeliveryRunPersonnelSet, deliveryRunController.setDeliveryRunPersonnel);");
        expect(routeSource).toContain("router.post('/delivery-runs/:deliveryRunId/members', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunIdParam, validateDeliveryRunMembersAdd, deliveryRunController.addDeliveryRunMembers);");
        expect(routeSource).toContain("router.delete('/delivery-runs/:deliveryRunId/members/:posTransactionId', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunMemberParam, deliveryRunController.removeDeliveryRunMember);");
        expect(routeSource).toContain("router.post('/delivery-runs/:deliveryRunId/dispatch', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateDeliveryRunIdParam, validateDeliveryRunDispatch, deliveryRunController.dispatchDeliveryRun);");
    });
});

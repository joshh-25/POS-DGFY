import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
    validateDeliveryRunRemittanceCreate,
    validateDeliveryRunRemittanceParam,
    validateDeliveryRunRemittanceVarianceParam,
    validateDeliveryRunVarianceResolution
} from '../src/validators/posValidator.js';

const mockCreate = jest.fn();
const mockList = jest.fn();
const mockGet = jest.fn();
const mockResolve = jest.fn();
const mockExistingUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/pos/index.js', () => ({
    createDeliveryRunUseCase: mockExistingUseCase,
    listDeliveryRunsUseCase: mockExistingUseCase,
    getDeliveryRunUseCase: mockExistingUseCase,
    updateDeliveryRunUseCase: mockExistingUseCase,
    setDeliveryRunPersonnelUseCase: mockExistingUseCase,
    addDeliveryRunMembersUseCase: mockExistingUseCase,
    removeDeliveryRunMemberUseCase: mockExistingUseCase,
    dispatchDeliveryRunUseCase: mockExistingUseCase,
    updateDeliveryRunMemberLoadingUseCase: mockExistingUseCase,
    confirmDeliveryRunLoadingUseCase: mockExistingUseCase,
    createDeliveryRunRemittanceUseCase: mockCreate,
    listDeliveryRunRemittancesUseCase: mockList,
    getDeliveryRunRemittanceUseCase: mockGet,
    resolveDeliveryRunRemittanceVarianceUseCase: mockResolve
}));

let createDeliveryRunRemittance;
let listDeliveryRunRemittances;
let getDeliveryRunRemittance;
let resolveDeliveryRunRemittanceVariance;

beforeAll(async () => {
    const handlers = await import('../src/modules/pos/controllers/deliveryRunHandlers.js');
    createDeliveryRunRemittance = handlers.createDeliveryRunRemittance;
    listDeliveryRunRemittances = handlers.listDeliveryRunRemittances;
    getDeliveryRunRemittance = handlers.getDeliveryRunRemittance;
    resolveDeliveryRunRemittanceVariance = handlers.resolveDeliveryRunRemittanceVariance;
});

const mockRes = () => {
    const res = { status: jest.fn(), json: jest.fn(), locals: {} };
    res.status.mockReturnValue(res);
    return res;
};

const request = (overrides = {}) => ({
    params: {},
    body: {},
    validatedParams: {},
    validatedData: {},
    user: { user_id: 12 },
    ip: '127.0.0.1',
    get: () => 'test-agent',
    ...overrides
});

const runValidator = (validator, req) => {
    const res = mockRes();
    const next = jest.fn();
    validator(req, res, next);
    return { req, res, next };
};

describe('delivery run remittance validators', () => {
    it('requires allocation amounts and accepts the optional variance reason', () => {
        const result = runValidator(validateDeliveryRunRemittanceCreate, {
            body: {
                idempotency_key: 'remittance-validator-001',
                allocations: [{ pos_transaction_id: 501, remitted_amount: '490.0000' }],
                variance_reason: 'Short count'
            }
        });
        expect(result.next).toHaveBeenCalledTimes(1);
        expect(result.req.validatedData.allocations[0].remitted_amount).toBe(490);
    });

    it('rejects duplicate allocations and empty resolution reasons', () => {
        const duplicate = runValidator(validateDeliveryRunRemittanceCreate, {
            body: {
                idempotency_key: 'remittance-validator-002',
                allocations: [
                    { pos_transaction_id: 501, remitted_amount: 500 },
                    { pos_transaction_id: 501, remitted_amount: 500 }
                ]
            }
        });
        const resolution = runValidator(validateDeliveryRunVarianceResolution, {
            body: { idempotency_key: 'resolution-validator-001', resolution_reason: '   ' }
        });
        expect(duplicate.next).not.toHaveBeenCalled();
        expect(resolution.next).not.toHaveBeenCalled();
    });

    it('validates remittance and variance path parameters', () => {
        const remittance = runValidator(validateDeliveryRunRemittanceParam, {
            params: { deliveryRunId: '7', remittanceId: '8' }
        });
        const variance = runValidator(validateDeliveryRunRemittanceVarianceParam, {
            params: { deliveryRunId: '7', remittanceId: '8', varianceId: '9' }
        });
        expect(remittance.next).toHaveBeenCalledTimes(1);
        expect(variance.next).toHaveBeenCalledTimes(1);
        expect(variance.req.validatedParams).toEqual({ deliveryRunId: 7, remittanceId: 8, varianceId: 9 });
    });
});

describe('delivery run remittance transport contracts', () => {
    it('forwards create, list, get, and resolution requests', async () => {
        mockCreate.mockResolvedValue({ success: true, data: { remittance: {} } });
        mockList.mockResolvedValue({ success: true, data: { items: [] } });
        mockGet.mockResolvedValue({ success: true, data: {} });
        mockResolve.mockResolvedValue({ success: true, data: { variance: {} } });

        const createReq = request({ validatedParams: { deliveryRunId: 7 }, validatedData: { allocations: [] } });
        await createDeliveryRunRemittance(createReq, mockRes(), jest.fn());
        await listDeliveryRunRemittances(request({ validatedParams: { deliveryRunId: 7 } }), mockRes(), jest.fn());
        await getDeliveryRunRemittance(request({ validatedParams: { deliveryRunId: 7, remittanceId: 8 } }), mockRes(), jest.fn());
        await resolveDeliveryRunRemittanceVariance(request({
            validatedParams: { deliveryRunId: 7, remittanceId: 8, varianceId: 9 },
            validatedData: { resolution_reason: 'Reviewed' }
        }), mockRes(), jest.fn());

        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ deliveryRunId: 7, payload: { allocations: [] } }));
        expect(mockList).toHaveBeenCalledWith({ deliveryRunId: 7, user: { user_id: 12 } });
        expect(mockGet).toHaveBeenCalledWith({ deliveryRunId: 7, remittanceId: 8, user: { user_id: 12 } });
        expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({ deliveryRunId: 7, remittanceId: 8, varianceId: 9 }));
    });

    it('registers the four remittance routes with their intended permissions', () => {
        const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/pos.js'), 'utf8');
        expect(routeSource).toContain("router.post('/delivery-runs/:deliveryRunId/remittances', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS)");
        expect(routeSource).toContain("router.get('/delivery-runs/:deliveryRunId/remittances', checkPermission(PERMISSIONS.POS.actions.VIEW_POS)");
        expect(routeSource).toContain("router.get('/delivery-runs/:deliveryRunId/remittances/:remittanceId', checkPermission(PERMISSIONS.POS.actions.VIEW_POS)");
        expect(routeSource).toContain("router.post('/delivery-runs/:deliveryRunId/remittances/:remittanceId/variances/:varianceId/resolution', checkPermission(PERMISSIONS.POS.actions.RESOLVE_DELIVERY_RUN_VARIANCE)");
    });
});

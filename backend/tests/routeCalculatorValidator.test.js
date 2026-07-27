import { jest } from '@jest/globals';
import { validateRouteCalculatorQuery } from '../src/validators/routeCalculatorValidator.js';

const createReq = (query) => ({ query });
const createRes = () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    return res;
};

describe('validateRouteCalculatorQuery', () => {
    it('passes through valid coordinates and defaults profile to undefined (usecase resolves the default)', () => {
        const req = createReq({
            origin_lat: '10.6980',
            origin_lng: '122.5645',
            dest_lat: '10.7202',
            dest_lng: '122.5621'
        });
        const res = createRes();
        const next = jest.fn();

        validateRouteCalculatorQuery(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.validatedQuery).toEqual(expect.objectContaining({
            origin_lat: 10.698,
            origin_lng: 122.5645,
            dest_lat: 10.7202,
            dest_lng: 122.5621
        }));
    });

    it('rejects missing coordinates with 422', () => {
        const req = createReq({ origin_lat: '10.6980' });
        const res = createRes();
        const next = jest.fn();

        validateRouteCalculatorQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(false);
        expect(payload.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['origin_lng', 'dest_lat', 'dest_lng']));
    });

    it('rejects out-of-range latitude/longitude', () => {
        const req = createReq({
            origin_lat: '999',
            origin_lng: '122.5645',
            dest_lat: '10.7202',
            dest_lng: '122.5621'
        });
        const res = createRes();
        const next = jest.fn();

        validateRouteCalculatorQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects an unsupported profile instead of forwarding it to GraphHopper', () => {
        const req = createReq({
            origin_lat: '10.6980',
            origin_lng: '122.5645',
            dest_lat: '10.7202',
            dest_lng: '122.5621',
            profile: 'foot'
        });
        const res = createRes();
        const next = jest.fn();

        validateRouteCalculatorQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});

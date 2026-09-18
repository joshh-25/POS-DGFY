import { validateAddressSearchQuery } from '../src/validators/geoSearchValidator.js';

const runValidator = (query) => new Promise((resolve) => {
    const req = { query };
    const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; resolve({ res: this, validated: null }); return this; }
    };
    validateAddressSearchQuery(req, res, () => resolve({ res, validated: req.validatedQuery }));
});

describe('validateAddressSearchQuery', () => {
    it('accepts a query with no bias, preserving existing caller behaviour', async () => {
        const { validated, res } = await runValidator({ query: 'Bakhaw' });

        expect(res.statusCode).toBeNull();
        expect(validated).toEqual(expect.objectContaining({ query: 'Bakhaw', limit: 8 }));
        expect(validated.lat).toBeUndefined();
        expect(validated.lon).toBeUndefined();
    });

    it('accepts a query with both bias coordinates', async () => {
        const { validated, res } = await runValidator({ query: 'Poblacion', lat: '10.72', lon: '122.56' });

        expect(res.statusCode).toBeNull();
        expect(validated.lat).toBe(10.72);
        expect(validated.lon).toBe(122.56);
    });

    it('rejects a half-supplied bias with 422', async () => {
        const latOnly = await runValidator({ query: 'Poblacion', lat: '10.72' });
        expect(latOnly.res.statusCode).toBe(422);

        const lonOnly = await runValidator({ query: 'Poblacion', lon: '122.56' });
        expect(lonOnly.res.statusCode).toBe(422);
    });

    it('rejects out-of-range bias coordinates with 422', async () => {
        const { res } = await runValidator({ query: 'Poblacion', lat: '999', lon: '122.56' });
        expect(res.statusCode).toBe(422);
    });

    it('still rejects a one-character query with 422', async () => {
        const { res } = await runValidator({ query: 'a' });
        expect(res.statusCode).toBe(422);
    });
});

import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';

const jsonResponse = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    headers: {
        get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null)
    },
    text: async () => JSON.stringify(body)
});

describe('GET /v1/dgfy/account/companies proxy', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('forwards auth and company context headers and returns backend body unchanged', async () => {
        const backendBody = {
            success: true,
            data: {
                companies: [{ tenant_id: 'tenant-1', is_current: true }],
                accepted_count: 1
            }
        };
        global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, backendBody));

        const response = await request(app)
            .get('/v1/dgfy/account/companies')
            .set('Authorization', 'Bearer dgfy-token')
            .set('x-company-token', 'company-token')
            .set('x-request-id', 'req-1')
            .set('User-Agent', 'DGFY-Mobile-Test');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(backendBody);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/v1\/dgfy\/account\/companies$/),
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    authorization: 'Bearer dgfy-token',
                    'x-company-token': 'company-token',
                    'x-request-id': 'req-1',
                    'user-agent': 'DGFY-Mobile-Test'
                })
            })
        );
    });

    it('returns backend auth failures unchanged', async () => {
        const backendBody = {
            success: false,
            data: null,
            message: 'DGFY account authentication is required.'
        };
        global.fetch = jest.fn().mockResolvedValue(jsonResponse(401, backendBody));

        const response = await request(app).get('/v1/dgfy/account/companies');

        expect(response.status).toBe(401);
        expect(response.body).toEqual(backendBody);
    });

    it('does not forward browser cookies to backend', async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, data: { companies: [] } }));

        await request(app)
            .get('/v1/dgfy/account/companies')
            .set('Authorization', 'Bearer dgfy-token')
            .set('Cookie', 'dgfy_session=browser-cookie');

        const [, requestOptions] = global.fetch.mock.calls[0];
        expect(requestOptions.headers.cookie).toBeUndefined();
    });

    it('returns a standard 502 envelope when backend is unavailable', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

        const response = await request(app)
            .get('/v1/dgfy/account/companies')
            .set('Authorization', 'Bearer dgfy-token');

        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            success: false,
            data: null,
            message: 'DGFY company list is temporarily unavailable.'
        });
    });
});

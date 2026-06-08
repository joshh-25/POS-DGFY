import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/server.js';
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';
import { createTestTenant, destroyTestTenant } from './helpers/testTenantHelper.js';

jest.setTimeout(120000);

describe('Refresh Token Rotation (RTR) Verification', () => {
    let testTenantContext;
    let companyToken;
    const REFRESH_COOKIE = 'sku_refresh_token';
    const CSRF_COOKIE = 'sku_csrf_token';

    beforeAll(async () => {
        await sequelize.authenticate();
        testTenantContext = await createTestTenant('rtrverify');
        companyToken = testTenantContext.token;
    });

    afterAll(async () => {
        if (testTenantContext) {
            await destroyTestTenant(testTenantContext);
        }
        await sequelize.close();
    });

    const extractCookieValue = (cookies = [], name) => {
        const rawCookie = cookies.find((cookie) => cookie.startsWith(`${name}=`));
        if (!rawCookie) return '';
        return decodeURIComponent(rawCookie.split(';')[0].split('=').slice(1).join('='));
    };

    const findCookie = (cookies = [], name) => cookies.find((cookie) => cookie.startsWith(`${name}=`)) || '';

    const expectRefreshCookieContract = (cookies = []) => {
        const cookie = findCookie(cookies, REFRESH_COOKIE);
        expect(cookie).toContain(`${REFRESH_COOKIE}=`);
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/');
        expect(cookie).toContain('Max-Age=');
    };

    const expectCsrfCookieContract = (cookies = []) => {
        const cookie = findCookie(cookies, CSRF_COOKIE);
        expect(cookie).toContain(`${CSRF_COOKIE}=`);
        expect(cookie).not.toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/');
        expect(cookie).toContain('Max-Age=');
    };

    const extractSession = (res) => {
        const cookies = res.headers['set-cookie'] || [];
        return {
            cookies,
            refreshCookie: extractCookieValue(cookies, REFRESH_COOKIE),
            csrfToken: extractCookieValue(cookies, CSRF_COOKIE)
        };
    };

    const registerAndLogin = async () => {
        const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const userData = {
            username: `rtruser-${stamp}`,
            email: `rtr-${stamp}@example.com`,
            phone_number: '+63 917 000 1000',
            password: 'TestPassword123!'
        };

        await request(app)
            .post('/api/v1/auth/register')
            .set('x-company-token', companyToken)
            .send(userData)
            .expect(201);

        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .set('x-company-token', companyToken)
            .send({
                email: userData.email,
                password: userData.password
            })
            .expect(200);

        return {
            email: userData.email,
            session: extractSession(loginRes)
        };
    };

    const cleanupUser = async (email) => {
        await testTenantContext?.models?.User?.destroy({ where: { email } }).catch(() => null);
        await db.User.destroy({ where: { email } }).catch(() => null);
    };

    it('should FAIL if RT1 is used twice (replay blocked after rotation)', async () => {
        const { email, session: session1 } = await registerAndLogin();
        expect(session1.refreshCookie).not.toBe('');
        expect(session1.csrfToken).not.toBe('');
        expectRefreshCookieContract(session1.cookies);
        expectCsrfCookieContract(session1.cookies);

        const firstRefresh = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('Cookie', session1.cookies)
            .set('x-csrf-token', session1.csrfToken)
            .send({})
            .expect(200);

        const session2 = extractSession(firstRefresh);
        expect(firstRefresh.body.data?.refreshToken).toBeUndefined();
        expect(session2.refreshCookie).not.toBe('');
        expect(session2.refreshCookie).not.toBe(session1.refreshCookie);
        expect(session2.csrfToken).not.toBe('');
        expect(session2.csrfToken).not.toBe(session1.csrfToken);
        expectRefreshCookieContract(session2.cookies);
        expectCsrfCookieContract(session2.cookies);

        const replayAttempt = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('Cookie', session1.cookies)
            .set('x-csrf-token', session1.csrfToken)
            .send({});

        expect(replayAttempt.status).toBe(401);
        expect(replayAttempt.body.success).toBe(false);

        await cleanupUser(email);
    });

    it('should succeed with the rotated RT2', async () => {
        const { email, session: session1 } = await registerAndLogin();
        expect(session1.refreshCookie).not.toBe('');

        const firstRefresh = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('Cookie', session1.cookies)
            .set('x-csrf-token', session1.csrfToken)
            .send({})
            .expect(200);

        const session2 = extractSession(firstRefresh);
        expect(session2.refreshCookie).not.toBe('');

        const secondRefresh = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('Cookie', session2.cookies)
            .set('x-csrf-token', session2.csrfToken)
            .send({})
            .expect(200);

        expect(secondRefresh.body.data?.token).toBeDefined();
        expect(secondRefresh.body.data?.refreshToken).toBeUndefined();
        const session3 = extractSession(secondRefresh);
        expect(session3.refreshCookie).not.toBe('');
        expect(session3.refreshCookie).not.toBe(session2.refreshCookie);
        expect(session3.csrfToken).not.toBe('');
        expectRefreshCookieContract(session3.cookies);
        expectCsrfCookieContract(session3.cookies);

        await cleanupUser(email);
    });

    it('should reject cookie refresh without a matching CSRF header', async () => {
        const { email, session } = await registerAndLogin();

        const missingCsrf = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('Cookie', session.cookies)
            .send({});

        expect(missingCsrf.status).toBe(403);
        expect(missingCsrf.body.error_code).toBe('CSRF_TOKEN_REQUIRED');

        const mismatchedCsrf = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('Cookie', session.cookies)
            .set('x-csrf-token', 'not-the-cookie-token')
            .send({});

        expect(mismatchedCsrf.status).toBe(403);
        expect(mismatchedCsrf.body.error_code).toBe('CSRF_TOKEN_REQUIRED');

        await cleanupUser(email);
    });

    it('should reject browser refresh authority sent only in the JSON body', async () => {
        const { email, session } = await registerAndLogin();

        const bodyOnlyRefresh = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('x-company-token', companyToken)
            .send({ refreshToken: session.refreshCookie });

        expect(bodyOnlyRefresh.status).toBe(400);
        expect(bodyOnlyRefresh.body.success).toBe(false);
        expect(bodyOnlyRefresh.body.message).toBe('Refresh token is required');

        await cleanupUser(email);
    });
});

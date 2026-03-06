import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import sequelize from '../src/config/database.js';
import { initializeRedis, closeRedis } from '../src/config/redis.js';

const originalEnv = { ...process.env };
let app;
let server;
let baseUrl;

// We need an actual open port to test the true network layer, not just the Express framework internal routing tree.
const TEST_PORT = 5032;

beforeAll(async () => {
    // Force development mode and ensure bypass flag is OFF to strictly enable rate limiters
    process.env.NODE_ENV = 'development';
    process.env.DISABLE_RATE_LIMIT = 'false';
    process.env.RATE_LIMIT_AUTH_MAX_REQUESTS = '2';
    process.env.PORT = TEST_PORT.toString();
    process.env.TRUST_PROXY = 'true'; // Force proxy trusting to test XFF headers
    process.env.SKIP_SERVER_START = 'true'; // Prevent server.js from auto-listening

    await sequelize.authenticate();

    // We also want to prove it uses Redis properly if available
    if (process.env.REDIS_URL) {
        await initializeRedis();
    }

    // Import app dynamically AFTER env variables are set so the middlewares initialize securely.
    const appModule = await import('../src/server.js');
    app = appModule.default;

    // Start a TRUE HTTP server bound to loopback.
    // This allows us to test the `req.ip` translation layer which supertest(app) bypasses.
    await new Promise((resolve) => {
        server = app.listen(TEST_PORT, '127.0.0.1', () => {
            baseUrl = `http://127.0.0.1:${TEST_PORT}`;
            resolve();
        });
    });
});

afterAll(async () => {
    process.env = originalEnv;
    await sequelize.close();
    await closeRedis();

    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
});

describe('E2E True Real-World Authentication Rate Limiting', () => {
    const BAD_CREDENTIALS = {
        email: 'hacker-bruteforce@example.com',
        password: 'wrongpassword123'
    };
    const TEST_COMPANY_TOKEN = 'token-testbox4236-175692e6';

    const SPOOFED_HACKER_IP = '203.0.113.5';

    it('protects the actual /api/v1/auth/login route against consecutive brute-force attacks from a proxy', async () => {
        // Attack Attempt 1
        const res1 = await request(baseUrl)
            .post('/api/v1/auth/login')
            .set('x-company-token', TEST_COMPANY_TOKEN)
            .set('X-Forwarded-For', SPOOFED_HACKER_IP) // Simulate traffic through a load balancer
            .send(BAD_CREDENTIALS)
            .expect(401);
        expect(res1.body.success).toBe(false);

        // Attack Attempt 2
        const res2 = await request(baseUrl)
            .post('/api/v1/auth/login')
            .set('x-company-token', TEST_COMPANY_TOKEN)
            .set('X-Forwarded-For', SPOOFED_HACKER_IP)
            .send(BAD_CREDENTIALS)
            .expect(401);
        expect(res2.body.success).toBe(false);

        // Attack Attempt 3: HARD BLOCK. 
        const res3 = await request(baseUrl)
            .post('/api/v1/auth/login')
            .set('x-company-token', TEST_COMPANY_TOKEN)
            .set('X-Forwarded-For', SPOOFED_HACKER_IP)
            .send(BAD_CREDENTIALS)
            .expect(429);

        expect(res3.body.success).toBe(false);
        expect(res3.body.message).toMatch(/Too many authentication attempts/);
        expect(Number(res3.headers['retry-after'])).toBeGreaterThan(0);

        // Validate Proxy Extraction Safety:
        // A genuine user on a DIFFERENT IP (but going through the SAME reverse proxy test port)
        // must NOT be blocked. If the server was misconfigured, it would block the 127.0.0.1 interface entirely.
        const genuineCredentials = {
            email: 'innocent-user@example.com',
            password: 'wrongpassword123'
        };

        const resGenuine = await request(baseUrl)
            .post('/api/v1/auth/login')
            .set('x-company-token', TEST_COMPANY_TOKEN)
            .set('X-Forwarded-For', '198.51.100.22') // A completely different real IP
            .send(genuineCredentials)
            .expect(401);

        expect(resGenuine.body.success).toBe(false); // They get 401 instead of 429, proving they aren't blocked!
    });
});

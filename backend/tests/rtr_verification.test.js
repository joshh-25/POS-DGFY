import request from 'supertest';
import app from '../src/server.js';
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';

describe('Refresh Token Rotation (RTR) Verification', () => {
    let rt1;
    let userData = {
        username: 'rtruser',
        email: 'rtr@example.com',
        password: 'TestPassword123!'
    };

    beforeAll(async () => {
        await sequelize.authenticate();
        // Clean up
        await db.User.destroy({ where: { email: userData.email } });

        // Register and get RT1
        const res = await request(app)
            .post('/api/v1/auth/register')
            .send(userData)
            .expect(201);
        rt1 = res.body.data.refreshToken;
    });

    afterAll(async () => {
        await db.User.destroy({ where: { email: userData.email } });
        await sequelize.close();
    });

    it('should FAIL if RT1 is used twice (Vulnerability check)', async () => {
        // First use of RT1
        const res1 = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('x-company-token', 'master-frontend-token')
            .send({ refreshToken: rt1 })
            .expect(200);

        const rt2 = res1.body.data?.refreshToken;
        expect(rt2).toBeDefined();
        expect(rt2).not.toBe(rt1); // Should be a new token

        // Second use of RT1 (Replay Attack)
        const res2 = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('x-company-token', 'master-frontend-token')
            .send({ refreshToken: rt1 });

        expect(res2.status).toBe(401);
        console.log('✅ SUCCESS: Refresh token reuse blocked.');
    });

    it('should succeed with the new RT2', async () => {
        // Get RT2 from a fresh refresh
        const res1 = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('x-company-token', 'master-frontend-token')
            .send({ refreshToken: rt1 });

        const rt2 = res1.body.data?.refreshToken;
        expect(rt2).toBeDefined();

        const res2 = await request(app)
            .post('/api/v1/auth/refresh-token')
            .set('x-company-token', 'master-frontend-token')
            .send({ refreshToken: rt2 })
            .expect(200);

        expect(res2.body.data?.token).toBeDefined();
    });
});

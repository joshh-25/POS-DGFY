import request from 'supertest';
import app from '../src/server.js';
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';

describe('Refresh Token Rotation (RTR) Verification', () => {
    beforeAll(async () => {
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    const registerAndLogin = async () => {
        const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const userData = {
            username: `rtruser-${stamp}`,
            email: `rtr-${stamp}@example.com`,
            password: 'TestPassword123!'
        };

        await request(app)
            .post('/api/v1/auth/register')
            .send(userData)
            .expect(201);

        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: userData.email,
                password: userData.password
            })
            .expect(200);

        return {
            email: userData.email,
            refreshToken: loginRes.body.data?.refreshToken
        };
    };

    const cleanupUser = async (email) => {
        await db.User.destroy({ where: { email } });
    };

    it('should FAIL if RT1 is used twice (replay blocked after rotation)', async () => {
        const { email, refreshToken: rt1 } = await registerAndLogin();
        expect(rt1).toBeDefined();

        const firstRefresh = await request(app)
            .post('/api/v1/auth/refresh-token')
            .send({ refreshToken: rt1 })
            .expect(200);

        const rt2 = firstRefresh.body.data?.refreshToken;
        expect(rt2).toBeDefined();
        expect(rt2).not.toBe(rt1);

        const replayAttempt = await request(app)
            .post('/api/v1/auth/refresh-token')
            .send({ refreshToken: rt1 });

        expect(replayAttempt.status).toBe(401);

        await cleanupUser(email);
    });

    it('should succeed with the rotated RT2', async () => {
        const { email, refreshToken: rt1 } = await registerAndLogin();
        expect(rt1).toBeDefined();

        const firstRefresh = await request(app)
            .post('/api/v1/auth/refresh-token')
            .send({ refreshToken: rt1 })
            .expect(200);

        const rt2 = firstRefresh.body.data?.refreshToken;
        expect(rt2).toBeDefined();

        const secondRefresh = await request(app)
            .post('/api/v1/auth/refresh-token')
            .send({ refreshToken: rt2 })
            .expect(200);

        expect(secondRefresh.body.data?.token).toBeDefined();
        expect(secondRefresh.body.data?.refreshToken).toBeDefined();

        await cleanupUser(email);
    });
});

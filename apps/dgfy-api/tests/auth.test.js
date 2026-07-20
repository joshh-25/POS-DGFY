import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/server.js';
import User from '../src/models/User.js';
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';
import tenantConnector from '../src/utils/TenantConnector.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { createTestTenant, destroyTestTenant } from './helpers/testTenantHelper.js';

jest.setTimeout(180000);

describe('Authentication API', () => {
  const TEST_EMAILS = ['test@example.com', 'testuser2@example.com'];
  const TEST_USERNAMES = ['testuser', 'testuser2'];
  let TEST_COMPANY_TOKEN;
  let testTenantContext;
  let previousLegacyTenantRegistrationFlag;

  const performTargetedCleanup = async () => {
    // SECURITY GUARD: Never run deletions if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      console.error('CRITICAL: performTargetedCleanup called in non-test environment!');
      return;
    }

    // SECURITY GUARD: Ensure we are using the test database OR the local SKU dev database
    const dbName = sequelize.config.database;
    if (!dbName.includes('test') && dbName !== 'SKU') {
      console.error(`CRITICAL: Cleanup blocked on potentially sensitive database: ${dbName}`);
      return;
    }

    try {
      // 1. Clean Landlord DB (SKU)
      const testUsersLandlord = await db.User.findAll({
        where: {
          [db.Sequelize.Op.or]: [
            { email: { [db.Sequelize.Op.like]: 'test%@example.com' } },
            { username: { [db.Sequelize.Op.like]: 'testuser%' } }
          ]
        },
        attributes: ['user_id', 'email']
      });

      const userIdsLandlord = testUsersLandlord.map(u => u.user_id);
      const emailsLandlord = testUsersLandlord.map(u => u.email);

      if (userIdsLandlord.length > 0) {
        await db.PurchaseOrder.destroy({ where: { created_by: userIdsLandlord } }).catch(() => { });
        await db.JobOrder.destroy({ where: { responsible_user: userIdsLandlord } }).catch(() => { });
        await db.StockMovement.destroy({ where: { user_responsible: userIdsLandlord } }).catch(() => { });
        await db.UserTenantMapping.destroy({ where: { email: emailsLandlord } }).catch(() => { });
        await db.User.destroy({ where: { user_id: userIdsLandlord } });
      }

      // 2. Clean Tenant DB (if resolved)
      const tenant = await db.Tenant.findOne({ where: { company_token: TEST_COMPANY_TOKEN } });
      if (tenant) {
        const tenantSequelize = await tenantConnector.getConnection(tenant);
        const tenantModels = getTenantModels(tenantSequelize);

        const testUsersTenant = await tenantModels.User.findAll({
          where: {
            [db.Sequelize.Op.or]: [
              { email: { [db.Sequelize.Op.like]: 'test%@example.com' } },
              { username: { [db.Sequelize.Op.like]: 'testuser%' } }
            ]
          },
          attributes: ['user_id']
        });

        const userIdsTenant = testUsersTenant.map(u => u.user_id);
        if (userIdsTenant.length > 0) {
          await tenantModels.PurchaseOrder.destroy({ where: { created_by: userIdsTenant } }).catch(() => { });
          await tenantModels.JobOrder.destroy({ where: { responsible_user: userIdsTenant } }).catch(() => { });
          await tenantModels.StockMovement.destroy({ where: { user_responsible: userIdsTenant } }).catch(() => { });
          await tenantModels.User.destroy({ where: { user_id: userIdsTenant } });
        }
      }
    } catch (error) {
      console.warn('Targeted cleanup warning:', error.message);
    }
  };

  beforeAll(async () => {
    previousLegacyTenantRegistrationFlag = process.env.DGFY_LEGACY_TENANT_REGISTRATION_ENABLED;
    process.env.DGFY_LEGACY_TENANT_REGISTRATION_ENABLED = 'true';
    // Connect to test database
    await sequelize.authenticate();
    testTenantContext = await createTestTenant('authapi');
    TEST_COMPANY_TOKEN = testTenantContext.token;
    await performTargetedCleanup(); // Clean state before starting
  });

  afterAll(async () => {
    // Final targeted cleanup
    await performTargetedCleanup();
    if (testTenantContext) {
      await destroyTestTenant(testTenantContext);
    }
    if (typeof previousLegacyTenantRegistrationFlag === 'undefined') {
      delete process.env.DGFY_LEGACY_TENANT_REGISTRATION_ENABLED;
    } else {
      process.env.DGFY_LEGACY_TENANT_REGISTRATION_ENABLED = previousLegacyTenantRegistrationFlag;
    }
    await sequelize.close();
  });

  beforeEach(async () => {
    // Refresh targeted cleanup before each test
    await performTargetedCleanup();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        phone_number: '+63 912 345 6789',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user_id');
      expect(response.body.data.token).toBeUndefined();
      expect(response.body.data.refreshToken).toBeUndefined();
      expect(response.body.data.username).toBe(userData.username);
      expect(response.body.data.email).toBe(userData.email);
    });

    it('should return 422 for invalid input', async () => {
      const userData = {
        username: 'ab', // Too short
        email: 'invalid-email',
        phone_number: 'bad',
        password: 'weak'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send(userData)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should return 409 for duplicate email', async () => {
      const userData = {
        username: 'testuser1',
        email: 'test@example.com',
        phone_number: '+63 912 345 6789',
        password: 'TestPassword123!'
      };

      // Create first user
      await request(app)
        .post('/api/v1/auth/register')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send(userData);

      // Try to register again with same email
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          ...userData,
          username: 'testuser2'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        phone_number: '+63 912 345 6789',
        password: 'TestPassword123!'
      };
      await request(app)
        .post('/api/v1/auth/register')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send(userData);
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).not.toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('expiresIn');
      expect(response.body.data.company).toEqual(expect.objectContaining({
        token: TEST_COMPANY_TOKEN
      }));
      expect(response.headers['set-cookie']?.join(';')).toContain('sku_refresh_token=');
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/refresh-token', () => {
    let sessionCookies;
    let csrfToken;

    beforeEach(async () => {
      // Create a test user and get refresh token
      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          username: 'testuser',
          email: 'test@example.com',
          phone_number: '+63 912 345 6789',
          password: 'TestPassword123!'
        });
      const loginResp = await request(app)
        .post('/api/v1/auth/login')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });
      sessionCookies = loginResp.headers['set-cookie'];
      csrfToken = String(sessionCookies.find((cookie) => cookie.startsWith('sku_csrf_token=')) || '')
        .split(';')[0]
        .split('=')[1];
    });

    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh-token')
        .set('Cookie', sessionCookies)
        .set('x-csrf-token', decodeURIComponent(csrfToken))
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('expiresIn');
      expect(response.body.data.company).toEqual(expect.objectContaining({
        token: TEST_COMPANY_TOKEN
      }));
    });

    it('should reject refresh authority sent only in the JSON body', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh-token')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({ refreshToken: 'invalid-token' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Refresh token is required');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let authToken;

    beforeEach(async () => {
      // Register and login to get token
      await request(app)
        .post('/api/v1/auth/register')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          username: 'testuser',
          email: 'test@example.com',
          phone_number: '+63 912 345 6789',
          password: 'TestPassword123!'
        });

      const loginResp = await request(app)
        .post('/api/v1/auth/login')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      authToken = loginResp.body.data.token;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logout successful');
    });
  });

  describe('PUT /api/v1/users/me', () => {
    let authToken;

    beforeEach(async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          username: 'testuser',
          email: 'test@example.com',
          phone_number: '+63 912 345 6789',
          password: 'TestPassword123!'
        });

      const loginResp = await request(app)
        .post('/api/v1/auth/login')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!'
        });

      authToken = loginResp.body.data.token;
    });

    it('rejects attempts to clear the required phone number', async () => {
      const response = await request(app)
        .put('/api/v1/users/me')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ phone_number: '' })
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'phone_number'
          })
        ])
      );
    });

    it('allows valid phone corrections and returns the normalized value', async () => {
      const response = await request(app)
        .put('/api/v1/users/me')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ phone_number: ' +63 917 111 2233 ' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.phone_number).toBe('+63 917 111 2233');
    });

    it('blocks protected work until accepted legacy users complete their phone number', async () => {
      const tenant = await db.Tenant.findOne({ where: { company_token: TEST_COMPANY_TOKEN } });
      const tenantSequelize = await tenantConnector.getConnection(tenant);
      const tenantModels = getTenantModels(tenantSequelize);
      await tenantModels.User.update(
        { phone_number: null },
        { where: { email: 'test@example.com' } }
      );

      const ownProfileResponse = await request(app)
        .get('/api/v1/users/me')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(ownProfileResponse.body.data.phone_number).toBeNull();

      const blockedResponse = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(428);

      expect(blockedResponse.body).toEqual(expect.objectContaining({
        success: false,
        error_code: 'PHONE_NUMBER_REQUIRED'
      }));

      await request(app)
        .put('/api/v1/users/me')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ phone_number: '+63 917 111 2233' })
        .expect(200);

      const unblockedResponse = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('x-company-token', TEST_COMPANY_TOKEN)
        .set('Authorization', `Bearer ${authToken}`);

      expect(unblockedResponse.status).not.toBe(428);
    });
  });
});

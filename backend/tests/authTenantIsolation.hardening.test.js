import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../src/server.js';
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';
import { ensureLandlordTenantSchemaReady } from './helpers/landlordSchemaReadiness.js';

const PENDING_TENANT_TOKEN_PREFIX = 'token-pending-hardening-';
const ACTIVE_TENANT_TOKEN_PREFIX = 'token-active-hardening-';

const cleanupPendingHardeningTenants = async () => {
  const pendingTenants = await db.Tenant.findAll({
    where: {
      [db.Sequelize.Op.or]: [
        {
          company_token: {
            [db.Sequelize.Op.like]: `${PENDING_TENANT_TOKEN_PREFIX}%`
          }
        },
        {
          company_token: {
            [db.Sequelize.Op.like]: `${ACTIVE_TENANT_TOKEN_PREFIX}%`
          }
        }
      ]
    },
    attributes: ['id', 'admin_email']
  });

  if (pendingTenants.length === 0) return;

  const tenantIds = pendingTenants.map((tenantRow) => tenantRow.id);
  const emails = pendingTenants
    .map((tenantRow) => String(tenantRow.admin_email || '').trim().toLowerCase())
    .filter(Boolean);

  if (emails.length > 0) {
    await db.UserTenantMapping.destroy({
      where: {
        email: emails
      }
    }).catch(() => { });
  }

  await db.Tenant.destroy({
    where: {
      id: tenantIds
    }
  });
};

const createActiveTenant = async () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const dbName = sequelize.config.database;
  return db.Tenant.create({
    id: crypto.randomUUID(),
    name: `Auth Hardening Active ${suffix}`,
    domain: `auth-hardening-active-${suffix}`,
    subdomain: `auth-hardening-active-${suffix}`,
    db_name: dbName,
    company_token: `${ACTIVE_TENANT_TOKEN_PREFIX}${suffix}`,
    status: 'active',
    admin_email: `auth-hardening-active-${suffix}@example.com`,
    admin_password_hash: '$2a$10$authHardeningActiveHashOnly',
    plan: 'standard',
    subscription_status: 'inactive'
  });
};

const createPendingTenant = async () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return db.Tenant.create({
    id: crypto.randomUUID(),
    name: `Auth Hardening Pending ${suffix}`,
    domain: `auth-hardening-${suffix}`,
    subdomain: `auth-hardening-${suffix}`,
    db_name: `sku_tenant_authhardening_${suffix}`,
    company_token: `${PENDING_TENANT_TOKEN_PREFIX}${suffix}`,
    status: 'pending',
    admin_email: `auth-hardening-${suffix}@example.com`,
    admin_password_hash: '$2a$10$authHardeningPendingHashOnly',
    plan: 'standard',
    subscription_status: 'inactive'
  });
};

describe('Auth tenant isolation hardening', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    await ensureLandlordTenantSchemaReady();
  });

  afterEach(async () => {
    await cleanupPendingHardeningTenants();
  });

  afterAll(async () => {
    await cleanupPendingHardeningTenants();
    await sequelize.close();
  });

  it('fails closed for user registration against pending/unprovisioned tenants', async () => {
    const pendingTenant = await createPendingTenant();

    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('x-company-token', pendingTenant.company_token)
      .send({
        username: 'hardening_user',
        email: 'hardening_user@example.com',
        password: 'Hardening123!'
      })
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('TENANT_PENDING_APPROVAL');
  });

  it('fails closed for login against pending/unprovisioned tenants', async () => {
    const pendingTenant = await createPendingTenant();

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('x-company-token', pendingTenant.company_token)
      .send({
        email: 'does-not-matter@example.com',
        password: 'Hardening123!'
      })
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('TENANT_PENDING_APPROVAL');
  });

  it('rejects authenticated requests without a valid tenant context even when JWT is valid', async () => {
    const signingSecret = process.env.JWT_SECRET || 'test_jwt_secret_for_ci_only_32_chars!';
    const token = jwt.sign({
      user_id: 1,
      username: 'tenantless',
      email: 'tenantless@example.com',
      role: 'admin'
    }, signingSecret, { expiresIn: '10m' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('TENANT_CONTEXT_REQUIRED');
  });

  it('rejects authenticated requests when JWT tenant binding is missing', async () => {
    const activeTenant = await createActiveTenant();
    const signingSecret = process.env.JWT_SECRET || 'test_jwt_secret_for_ci_only_32_chars!';
    const token = jwt.sign({
      user_id: 1,
      username: 'legacy-token',
      email: 'legacy-token@example.com',
      role: 'admin'
    }, signingSecret, { expiresIn: '10m' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('x-company-token', activeTenant.company_token)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('TENANT_BINDING_REQUIRED');
  });

  it('rejects authenticated requests when JWT tenant binding mismatches request tenant', async () => {
    const activeTenant = await createActiveTenant();
    const signingSecret = process.env.JWT_SECRET || 'test_jwt_secret_for_ci_only_32_chars!';
    const token = jwt.sign({
      user_id: 1,
      username: 'wrong-tenant',
      email: 'wrong-tenant@example.com',
      role: 'admin',
      tenant_id: '00000000-0000-4000-8000-000000000000'
    }, signingSecret, { expiresIn: '10m' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('x-company-token', activeTenant.company_token)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('TENANT_BINDING_MISMATCH');
  });

  it('rejects browser requests when the active company cookie is stale', async () => {
    const activeTenant = await createActiveTenant();
    const signingSecret = process.env.JWT_SECRET || 'test_jwt_secret_for_ci_only_32_chars!';
    const token = jwt.sign({
      user_id: 1,
      username: 'stale-company-context',
      email: 'stale-company-context@example.com',
      role: 'admin',
      tenant_id: activeTenant.id
    }, signingSecret, { expiresIn: '10m' });

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('x-company-token', activeTenant.company_token)
      .set('Cookie', 'sku_tenant_context=previous-company-token')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('TENANT_SESSION_CONTEXT_MISMATCH');
  });

  it('fails closed for invite validation when token-only invite cannot be resolved', async () => {
    const fakeInviteToken = 'a'.repeat(64);

    const response = await request(app)
      .get(`/api/v1/auth/validate-invite/${fakeInviteToken}`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('INVITATION_TOKEN_INVALID');
  });

  it('fails closed for invite acceptance when token-only invite cannot be resolved', async () => {
    const response = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({
        token: 'a'.repeat(64),
        username: 'invited_user',
        phone_number: '+63 912 345 6789',
        password: 'StrongPass123!'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('INVITATION_TOKEN_INVALID');
  });
});

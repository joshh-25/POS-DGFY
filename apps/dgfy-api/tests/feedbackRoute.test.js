import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const verifyStoreToken = jest.fn(() => { throw new Error('wrong scope'); });
const verifyToken = jest.fn(() => { throw new Error('wrong scope'); });
const authenticate = jest.fn((req, _res, next) => { req.user = { user_id: 7, username: 'Staff', email: 'staff@example.com' }; next(); });

jest.unstable_mockModule('../src/middleware/rateLimiter.js', () => ({ feedbackSubmissionLimiter: (_req, _res, next) => next() }));
jest.unstable_mockModule('../src/controllers/feedbackController.js', () => ({
  submitFeedback: (req, res) => res.status(201).json({ identity: req.feedbackIdentity, tenant: req.tenant || null, body: req.body })
}));
jest.unstable_mockModule('../src/modules/store/utils/storeJwtToken.js', () => ({ verifyStoreToken, normalizeTenantIdentifier: (value) => value || null }));
jest.unstable_mockModule('../src/services/authService.js', () => ({ verifyToken, isTokenBlacklisted: jest.fn().mockResolvedValue(false) }));
jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({ dgfyAccountRepository: { findById: jest.fn() } }));
jest.unstable_mockModule('../src/middleware/auth.js', () => ({ authenticate }));
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: { get: () => ({ findByPk: jest.fn() }) } }));

let app;
beforeAll(async () => {
  const { default: feedbackRouter } = await import('../src/routes/feedback.js');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers['x-store-slug'] === 'shop') req.tenant = { id: 'tenant-uuid', name: 'Shop' };
    next();
  });
  app.use('/api/v1/feedback', feedbackRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  verifyStoreToken.mockImplementation(() => { throw new Error('wrong scope'); });
  verifyToken.mockImplementation(() => { throw new Error('wrong scope'); });
  authenticate.mockImplementation((req, _res, next) => { req.user = { user_id: 7, username: 'Staff', email: 'staff@example.com' }; next(); });
});

const body = { type: 'bug', description: 'Broken cart', contact: { name: 'Guest', email: 'guest@example.com' } };

describe('feedback route middleware order', () => {
  it('accepts tenant-less and tenant-scoped guests', async () => {
    const plain = await request(app).post('/api/v1/feedback').send(body);
    expect(plain.status).toBe(201);
    expect(plain.body.identity).toBeNull();
    expect(plain.body.tenant).toBeNull();
    const scoped = await request(app).post('/api/v1/feedback').set('x-store-slug', 'shop').send(body);
    expect(scoped.status).toBe(201);
    expect(scoped.body.tenant).toEqual({ id: 'tenant-uuid', name: 'Shop' });
  });

  it('requires guest contact and strips spoofed contact from staff requests', async () => {
    expect((await request(app).post('/api/v1/feedback').send({ type: 'bug', description: 'x' })).status).toBe(400);
    const staff = await request(app).post('/api/v1/feedback').set('authorization', 'Bearer staff').send(body);
    expect(staff.status).toBe(201);
    expect(staff.body.identity).toEqual(expect.objectContaining({ kind: 'tenant_user', id: 7 }));
    expect(staff.body.body.contact).toBeUndefined();
  });

  it('rejects a bad token instead of treating it as guest', async () => {
    authenticate.mockImplementation((_req, res) => res.status(401).json({ message: 'Invalid token' }));
    const bad = await request(app).post('/api/v1/feedback').set('authorization', 'Bearer garbage').send(body);
    expect(bad.status).toBe(401);
  });
});

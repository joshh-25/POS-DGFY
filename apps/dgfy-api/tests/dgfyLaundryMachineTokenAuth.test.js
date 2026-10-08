import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const MACHINE_CLIENT_ID = 'dglaundry-machine';
const ISSUER = 'https://api.stage.dgfy.ph/oidc';
const originalEnvironment = { ...process.env };
const machinePair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const machinePrivateKey = machinePair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const machinePublicKey = machinePair.publicKey.export({ type: 'spki', format: 'pem' });

let provider;
let redisClient;
let storedValues;
let failMachineTokenStorage;

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

const makeMachineRequest = (scope = 'dglaundry') => {
  const assertion = jwt.sign({}, machinePrivateKey, {
    algorithm: 'RS256',
    issuer: MACHINE_CLIENT_ID,
    subject: MACHINE_CLIENT_ID,
    audience: `${ISSUER}/token`,
    expiresIn: 60,
    jwtid: crypto.randomUUID()
  });
  return {
    headers: {},
    body: {
      grant_type: 'client_credentials',
      client_id: MACHINE_CLIENT_ID,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope
    },
    query: {}
  };
};

beforeEach(async () => {
  jest.resetModules();
  process.env.NODE_ENV = 'production';
  process.env.DGFY_OIDC_ISSUER = ISSUER;
  process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID = MACHINE_CLIENT_ID;
  process.env.DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE = `${ISSUER}/token`;
  process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY = machinePublicKey;
  storedValues = new Map();
  failMachineTokenStorage = false;
  redisClient = {
    set: jest.fn(async (key, value, options) => {
      if (key.startsWith('dglaundry:oidc:access:') && failMachineTokenStorage) return false;
      if (options?.NX && storedValues.has(key)) return null;
      storedValues.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key) => storedValues.get(key) ?? null),
    getDel: jest.fn(async (key) => {
      const value = storedValues.get(key) ?? null;
      storedValues.delete(key);
      return value;
    }),
    del: jest.fn(async (key) => storedValues.delete(key))
  };
  jest.unstable_mockModule('../src/config/redis.js', () => ({
    getRedisClient: () => redisClient,
    isRedisConnected: () => true
  }));
  jest.unstable_mockModule('../src/modules/dgfy/repositories/dgfyAccountRepository.js', () => ({
    dgfyAccountRepository: { findById: jest.fn() }
  }));
  jest.unstable_mockModule('../src/modules/shared/utils/oidcSigningKeyResolver.js', () => ({
    resolveSigningKeyMaterial: () => ({ pem: '', kid: null })
  }));
  provider = await import('../src/modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js');
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('DGLaundry machine-token registration', () => {
  test('issues only the exact registered inbound scope and persists the opaque grant first', async () => {
    const response = makeResponse();
    await provider.oidcToken(makeMachineRequest(), response, (error) => { throw error; });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ token_type: 'Bearer', expires_in: 300, scope: 'dglaundry' });
    expect(typeof response.body.access_token).toBe('string');
    expect(storedValues.has(`dglaundry:oidc:access:${response.body.access_token}`)).toBe(true);
  });

  test('rejects unregistered, reverse-direction, combined, and missing scopes', async () => {
    for (const scope of ['dglaundry:orders:read', 'openid dglaundry', 'unknown', '']) {
      const response = makeResponse();
      await provider.oidcToken(makeMachineRequest(scope), response, (error) => { throw error; });
      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ error: 'invalid_scope' });
    }
  });

  test('does not return a token when durable grant storage fails', async () => {
    failMachineTokenStorage = true;
    const response = makeResponse();
    await provider.oidcToken(makeMachineRequest(), response, (error) => { throw error; });

    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({ error: 'temporarily_unavailable' });
    expect(response.body).not.toHaveProperty('access_token');
  });
});

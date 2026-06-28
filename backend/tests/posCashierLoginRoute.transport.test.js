import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import app from '../src/server.js';

describe('POS cashier login route', () => {
  it('is mounted under the POS API route', async () => {
    const response = await request(app)
      .post('/api/v1/pos/auth/cashier-login')
      .send({});

    expect(response.status).not.toBe(404);
    expect(response.body?.message).not.toMatch(/route .* not found/i);
  });
});

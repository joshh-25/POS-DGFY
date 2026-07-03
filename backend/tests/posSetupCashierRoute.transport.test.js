import request from 'supertest';
import app from '../src/server.js';

describe('POS setup cashier route', () => {
  it('mounts the cashier list under the POS API route', async () => {
    const response = await request(app)
      .get('/api/v1/pos/setup/cashiers');

    expect(response.status).not.toBe(404);
    expect(response.body?.message).not.toMatch(/route .* not found/i);
  });

  it('is mounted under the POS API route', async () => {
    const response = await request(app)
      .post('/api/v1/pos/setup/cashiers')
      .send({});

    expect(response.status).not.toBe(404);
    expect(response.body?.message).not.toMatch(/route .* not found/i);
  });
});

import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SKIP_SERVER_START = 'true';
process.env.CORS_ORIGIN = 'https://dgfy.ph';
process.env.PUBLIC_API_CORS_ORIGIN = 'https://mapviu.com,https://*.mapviu.com';

const { default: app } = await import('../src/server.js');

describe('public API CORS preflight transport', () => {
  it('rejects unsupported MapViu public API methods as client errors', async () => {
    const response = await request(app)
      .options('/api/v1/storefront/discovery/map-pins')
      .set('Origin', 'https://app.mapviu.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(403);
    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      message: 'Not allowed by CORS',
      error_code: 'CORS_NOT_ALLOWED'
    }));
  });
});

import { jest } from '@jest/globals';
import { createOidcInteractionHandlers } from '../src/modules/partnerIdentity/controllers/oidcInteractionHandlers.js';

const previousEnv = {};

const createResponse = () => {
  const headers = {};
  return {
    headers,
    getHeader: (name) => headers[name],
    setHeader: (name, value) => { headers[name] = value; },
    set: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
};

describe('OIDC interaction browser origin checks', () => {
  beforeAll(() => {
    for (const key of ['NODE_ENV', 'DGFY_OIDC_ISSUER', 'STOREFRONT_PUBLIC_ORIGIN']) {
      previousEnv[key] = process.env[key];
    }
    process.env.NODE_ENV = 'production';
    process.env.DGFY_OIDC_ISSUER = 'https://api.stage.dgfy.ph/oidc';
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://stage.dgfy.ph';
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('allows a credentialed Storefront request with same-site Fetch Metadata and an exact Origin', async () => {
    const interactionUseCases = {
      bindStorefrontBrowser: jest.fn().mockResolvedValue({
        browser_binding: 'b'.repeat(43),
        expires_at: Date.now() + 60_000
      })
    };
    const handlers = createOidcInteractionHandlers({ interactionUseCases });
    const req = {
      params: { id: 'i'.repeat(43) },
      headers: {
        origin: 'https://stage.dgfy.ph',
        'sec-fetch-site': 'same-site',
        'x-csrf-token': 'csrf-value'
      },
      cookies: { sku_csrf_token: 'csrf-value' },
      body: { handoff: 'handoff-value' }
    };
    const res = createResponse();

    await handlers.bindStorefrontBrowser(req, res, jest.fn());

    expect(interactionUseCases.bindStorefrontBrowser).toHaveBeenCalledWith(expect.objectContaining({
      id: req.params.id,
      handoff: 'handoff-value'
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a cross-site request even when its Origin string matches', async () => {
    const interactionUseCases = { bindStorefrontBrowser: jest.fn() };
    const handlers = createOidcInteractionHandlers({ interactionUseCases });
    const req = {
      params: { id: 'i'.repeat(43) },
      headers: {
        origin: 'https://stage.dgfy.ph',
        'sec-fetch-site': 'cross-site',
        'x-csrf-token': 'csrf-value'
      },
      cookies: { sku_csrf_token: 'csrf-value' },
      body: { handoff: 'handoff-value' }
    };
    const next = jest.fn();

    await handlers.bindStorefrontBrowser(req, createResponse(), next);

    expect(interactionUseCases.bindStorefrontBrowser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'OIDC_ORIGIN_INVALID' }));
  });
});

import { resolveDglaundryOrigin, resolveDglaundryRedirectUri } from '../src/modules/dgfyLaundry/dglaundryOrigin.js';
import { dglaundryLegacyClientSource, isDglaundryParPkceConfigured } from '../src/modules/partnerIdentity/adapters/dglaundryOidcAdapter.js';

const KEYS = ['DGLAUNDRY_PARTNER_BASE_URL', 'DGFY_DGLAUNDRY_REDIRECT_URI', 'DGFY_DGLAUNDRY_CLIENT_SECRET', 'DGFY_DGLAUNDRY_CLIENT_SECRET_FILE'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
beforeEach(() => { for (const key of KEYS) delete process.env[key]; });
afterAll(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

describe('DGLaundry origin resolution (#2513)', () => {
  it.each([
    ['https://dglaundry.dgfy.ph', 'https://dglaundry.dgfy.ph'],
    ['https://dglaundry.stage.dgfy.ph/', 'https://dglaundry.stage.dgfy.ph'],
    ['  https://dglaundry.dgfy.ph/some/path?x=1  ', 'https://dglaundry.dgfy.ph'],
    ['http://127.0.0.1:4400', 'http://127.0.0.1:4400']
  ])('normalizes %p to its origin', (configured, expected) => {
    expect(resolveDglaundryOrigin({ DGLAUNDRY_PARTNER_BASE_URL: configured })).toBe(expected);
  });

  it.each([undefined, '', '   ', 'not a url', 'ftp://dglaundry.dgfy.ph', 'javascript:alert(1)'])('returns null for %p, never a guessed host', (configured) => {
    expect(resolveDglaundryOrigin({ DGLAUNDRY_PARTNER_BASE_URL: configured })).toBeNull();
  });

  it('derives the callback from the origin, lets an explicit redirect win, and has no default', () => {
    expect(resolveDglaundryRedirectUri({ DGLAUNDRY_PARTNER_BASE_URL: 'https://dglaundry.dgfy.ph' }))
      .toBe('https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback');
    expect(resolveDglaundryRedirectUri({ DGLAUNDRY_PARTNER_BASE_URL: 'https://a.example', DGFY_DGLAUNDRY_REDIRECT_URI: 'https://b.example/cb' }))
      .toBe('https://b.example/cb');
    expect(resolveDglaundryRedirectUri({})).toBe('');
  });
});

describe('DGLaundry OIDC client source uses configured hosts only (#2513)', () => {
  it('registers the browser client with the configured redirect', async () => {
    process.env.DGFY_DGLAUNDRY_CLIENT_SECRET = 'test-secret';
    process.env.DGLAUNDRY_PARTNER_BASE_URL = 'https://dglaundry.dgfy.ph';
    const client = await dglaundryLegacyClientSource('dglaundry-web');
    expect(client.redirect_uris).toEqual(['https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback']);
    expect(isDglaundryParPkceConfigured()).toBe(true);
  });

  it('does not register the browser client, or report PAR/PKCE ready, when no host is configured', async () => {
    process.env.DGFY_DGLAUNDRY_CLIENT_SECRET = 'test-secret';
    await expect(dglaundryLegacyClientSource('dglaundry-web')).resolves.toBeNull();
    expect(isDglaundryParPkceConfigured()).toBe(false);
  });
});

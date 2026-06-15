import { describe, expect, it } from 'vitest';
import { getRuntimeConfig, resolveApiBaseUrl, resolveAssetOrigin } from '../runtimeConfig.js';

describe('runtimeConfig utilities', () => {
  it('prefers desktop shell runtime values when present', () => {
    globalThis.window = {
      location: {
        origin: 'file://',
        hostname: ''
      },
      __DGFY_POS_RUNTIME__: {
        isDesktopShell: true,
        backendOrigin: 'http://192.168.1.20:5001',
        companyToken: 'token-original',
        terminalId: 'COUNTER-01',
        appSurface: 'pos'
      }
    };

    const runtime = getRuntimeConfig({ VITE_API_URL: '/api/v1' }, globalThis.window.location);

    expect(runtime.isDesktopShell).toBe(true);
    expect(runtime.apiBaseUrl).toBe('http://192.168.1.20:5001/api/v1');
    expect(runtime.assetBaseUrl).toBe('http://192.168.1.20:5001');
    expect(resolveApiBaseUrl({ VITE_API_URL: '/api/v1' }, globalThis.window.location)).toBe('http://192.168.1.20:5001/api/v1');
    expect(resolveAssetOrigin({ VITE_API_URL: '/api/v1' }, '', runtime)).toBe('http://192.168.1.20:5001');

    delete globalThis.window;
  });

  it('falls back to env configuration outside the desktop shell', () => {
    const location = {
      origin: 'https://pos.dgfy.ph',
      hostname: 'pos.dgfy.ph'
    };

    expect(resolveApiBaseUrl({ VITE_API_URL: 'https://api.dgfy.ph/api/v1' }, location)).toBe('https://api.dgfy.ph/api/v1');
    expect(resolveAssetOrigin({ VITE_API_BASE_URL: 'https://api.dgfy.ph' }, location.origin)).toBe('https://api.dgfy.ph');
  });
});

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
        companyToken: 'test-company-token',
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

  it('normalizes absolute API paths and rejects non-http configuration', () => {
    const location = {
      origin: 'https://pos.dgfy.ph',
      hostname: 'pos.dgfy.ph'
    };

    expect(resolveApiBaseUrl({ VITE_API_URL: 'https://api.dgfy.ph/api/v1///' }, location)).toBe('https://api.dgfy.ph/api/v1');
    expect(resolveApiBaseUrl({ VITE_API_URL: 'javascript:alert(1)' }, location)).toBe('/api/v1');
    expect(resolveApiBaseUrl({ VITE_API_URL: '//unexpected.example/api/v1' }, location)).toBe('/api/v1');
    expect(resolveAssetOrigin({ VITE_ASSET_BASE_URL: 'ftp://cdn.example.test' }, location.origin)).toBe('');
  });

  it('fails closed when a desktop runtime supplies an invalid origin', () => {
    globalThis.window = {
      location: {
        origin: 'https://pos.dgfy.ph',
        hostname: 'pos.dgfy.ph'
      },
      __DGFY_POS_RUNTIME__: {
        isDesktopShell: true,
        backendOrigin: 'javascript:alert(1)',
        apiBaseUrl: '//unexpected.example/api/v1',
        assetBaseUrl: 'ftp://cdn.example.test'
      }
    };

    const runtime = getRuntimeConfig({}, globalThis.window.location);

    expect(runtime.isDesktopShell).toBe(true);
    expect(runtime.backendOrigin).toBe('');
    expect(runtime.apiBaseUrl).toBe('');
    expect(runtime.assetBaseUrl).toBe('');
    expect(resolveApiBaseUrl({}, globalThis.window.location)).toBe('/api/v1');

    delete globalThis.window;
  });
});

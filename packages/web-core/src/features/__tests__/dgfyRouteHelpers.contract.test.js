import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveDgfyPostAuthTarget,
  resolvePosTerminalUrl,
  resolveStorefrontAccountUrl,
  resolveStorefrontItemUrl,
  resolveStorefrontTenantUrl,
  sanitizeInternalReturnPath
} from '../dgfyRouteHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeHelperPath = resolve(__dirname, '../dgfyRouteHelpers.js');
const skupervisorMainPath = resolve(__dirname, '../../../../../apps/dgfy-ims/src/main.jsx');
const routeHelperSource = readFileSync(routeHelperPath, 'utf8');
const skupervisorMainSource = readFileSync(skupervisorMainPath, 'utf8');

describe('DGFY route helper contracts', () => {
  it('routes POS terminal handoffs through the configured terminal URL', () => {
    expect(routeHelperSource).toContain("export const resolvePosTerminalUrl = (search = '') => {");
    expect(routeHelperSource).toContain("import.meta.env?.VITE_POS_TERMINAL_URL");
    expect(routeHelperSource).toContain("target.pathname.replace(/\\/+$/, '') === '/terminal'");
    expect(routeHelperSource).toContain('target.hash = terminalPath');
    expect(routeHelperSource).toContain("VITE_POS_DEV_PORT || '5174'");
    expect(routeHelperSource).toContain("hostname.startsWith('skupervisor.')");
  });

  it('keeps standalone POS handoffs inside the HashRouter route', () => {
    vi.stubGlobal('window', {
      location: {
        protocol: 'http:',
        hostname: 'localhost',
        port: '5173'
      }
    });

    try {
      expect(resolvePosTerminalUrl('?setup_flow=tenant_onboarding&setup_step=profile'))
        .toBe('http://localhost:5174/#/terminal?setup_flow=tenant_onboarding&setup_step=profile');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the SKUpervisor terminal route on the governed terminal page', () => {
    expect(skupervisorMainSource).toContain("const TerminalPage = lazy(() => import('../../../packages/web-core/src/features/pos/pages/TerminalPage.jsx'))");
    expect(skupervisorMainSource).toContain('<Route path="/terminal" element={<TerminalPage />} />');
  });

  it('builds a saved-item Storefront detail URL without exposing inventory routes', () => {
    expect(resolveStorefrontItemUrl({
      slug: 'masu-cafe-ed841f',
      itemId: 54,
      storefrontHomeUrl: 'https://dgfy.ph/'
    })).toBe('https://dgfy.ph/tenant-store/masu-cafe-ed841f/item?item=54');

    expect(resolveStorefrontItemUrl({
      slug: '',
      itemId: 54,
      storefrontHomeUrl: 'https://dgfy.ph/'
    })).toBe('');
  });

  it('builds the public Storefront URL from the saved tenant slug', () => {
    expect(resolveStorefrontTenantUrl({
      slug: 'masu-cafe-ed841f',
      storefrontHomeUrl: 'https://dgfy.ph/'
    })).toBe('https://dgfy.ph/tenant-store/masu-cafe-ed841f');

    expect(resolveStorefrontTenantUrl({
      slug: '',
      storefrontHomeUrl: 'https://dgfy.ph/'
    })).toBe('');
  });

  describe('resolveDgfyPostAuthTarget fallbackTarget', () => {
    it('defaults to the storefront account dashboard when no fallbackTarget is supplied - existing (storefront) callers must be unaffected', () => {
      expect(resolveDgfyPostAuthTarget({})).toBe(resolveStorefrontAccountUrl());
    });

    it('lets SKUpervisor land an already-signed-in user on its own company picker instead of ejecting to dgfy.ph', () => {
      expect(resolveDgfyPostAuthTarget({ fallbackTarget: '/dgfy/companies' })).toBe('/dgfy/companies');
    });

    it('still prefers an explicit same-origin return_to over the fallback', () => {
      expect(resolveDgfyPostAuthTarget({ returnTo: '/items', fallbackTarget: '/dgfy/companies' })).toBe('/items');
    });

    it('falls back (not to the storefront) when return_to is an open-redirect attempt', () => {
      expect(resolveDgfyPostAuthTarget({ returnTo: '//evil.test', fallbackTarget: '/dgfy/companies' })).toBe('/dgfy/companies');
    });
  });

  describe('sanitizeInternalReturnPath', () => {
    it('rejects protocol-relative and absolute targets', () => {
      expect(sanitizeInternalReturnPath('//evil.test/x')).toBe('/');
      expect(sanitizeInternalReturnPath('https://evil.test/x')).toBe('/');
    });

    it('uses the storefront default block list (login/register/reset-password) when none is supplied', () => {
      expect(sanitizeInternalReturnPath('/login')).toBe('/');
      expect(sanitizeInternalReturnPath('/register/step-2')).toBe('/');
    });

    it('honors a caller-supplied block list, e.g. SKUpervisor guarding its own auth routes', () => {
      const skupervisorPattern = /^\/(login|dgfy\/auth|dgfy\/companies|dgfy\/reset-password)(?:[/?#]|$)/i;
      expect(sanitizeInternalReturnPath('/dgfy/companies', { blockedPattern: skupervisorPattern })).toBe('/');
      expect(sanitizeInternalReturnPath('/dgfy/auth?x=1', { blockedPattern: skupervisorPattern })).toBe('/');
      // '/register' is on the storefront's default block list but not on
      // SKUpervisor's - proves the caller's own pattern is what's actually
      // consulted, not the module-level default.
      expect(sanitizeInternalReturnPath('/register', { blockedPattern: skupervisorPattern })).toBe('/register');
    });

    it('accepts a same-origin path with query and hash', () => {
      expect(sanitizeInternalReturnPath('/items?x=1#y')).toBe('/items?x=1#y');
    });
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStorefrontItemUrl } from '../dgfyRouteHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeHelperPath = resolve(__dirname, '../dgfyRouteHelpers.js');
const skupervisorMainPath = resolve(__dirname, '../../main.jsx');
const routeHelperSource = readFileSync(routeHelperPath, 'utf8');
const skupervisorMainSource = readFileSync(skupervisorMainPath, 'utf8');

describe('DGFY route helper contracts', () => {
  it('routes POS terminal handoffs through the configured terminal URL', () => {
    expect(routeHelperSource).toContain("export const resolvePosTerminalUrl = (search = '') => {");
    expect(routeHelperSource).toContain("import.meta.env?.VITE_POS_TERMINAL_URL");
    expect(routeHelperSource).toContain('configured.search = terminalPath.includes');
    expect(routeHelperSource).toContain("VITE_POS_DEV_PORT || '5174'");
    expect(routeHelperSource).toContain("hostname.startsWith('skupervisor.')");
  });

  it('keeps the SKUpervisor terminal route on the governed terminal page', () => {
    expect(skupervisorMainSource).toContain("const TerminalPage = lazy(() => import('./features/pos/pages/TerminalPage.jsx'))");
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
});

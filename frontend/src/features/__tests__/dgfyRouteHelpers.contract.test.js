import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeHelperPath = resolve(__dirname, '../dgfyRouteHelpers.js');
const skupervisorMainPath = resolve(__dirname, '../../main.jsx');
const routeHelperSource = readFileSync(routeHelperPath, 'utf8');
const skupervisorMainSource = readFileSync(skupervisorMainPath, 'utf8');

describe('DGFY route helper contracts', () => {
  it('routes POS terminal handoffs to the dedicated POS app origin', () => {
    expect(routeHelperSource).toContain("export const resolvePosTerminalUrl = (search = '') => {");
    expect(routeHelperSource).toContain("import.meta.env?.VITE_POS_DEV_PORT || '5174'");
    expect(routeHelperSource).toContain("import.meta.env?.VITE_POS_TERMINAL_URL");
    expect(routeHelperSource).toContain("import.meta.env?.VITE_POS_BASE_URL");
    expect(routeHelperSource).toContain("'https://pos.dgfy.ph/terminal'");
    expect(routeHelperSource).toContain("hostname.replace(/^skupervisor\\./, 'pos.')");
    expect(routeHelperSource).toContain("url.pathname = '/terminal';");
  });

  it('redirects the SKUpervisor terminal route to the dedicated POS app', () => {
    expect(skupervisorMainSource).toContain("import { resolvePosTerminalUrl } from './features/dgfyRouteHelpers.js'");
    expect(skupervisorMainSource).toContain('window.location.replace(resolvePosTerminalUrl(location.search))');
    expect(skupervisorMainSource).toContain('<Route path="/terminal" element={<PosTerminalRedirect />} />');
    expect(skupervisorMainSource).not.toContain("import('./features/pos/pages/TerminalPage.jsx')");
  });
});

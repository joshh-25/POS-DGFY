import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// src/main.jsx stayed behind in apps/dgfy-ims when the shared trunk moved into
// packages/web-core; apps/dgfy-pos/src/main.jsx is its own sibling app (issue #322 Phase 4)
// -- see docs/architecture/frontend-split-sync.md.
const appsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../apps');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');
const appRoot = path.join(appsRoot, 'dgfy-ims');
const posRoot = path.join(appsRoot, 'dgfy-pos');
const desktopRoot = path.join(posRoot, 'desktop', 'pos-electron');
const readSource = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('browser entrypoint session helper contract', () => {
  it('keeps development auto-login environment-only on the shared tenant login/session service', () => {
    const imMain = readSource(appRoot, 'src/main.jsx');
    const posMain = readSource(posRoot, 'src/main.jsx');

    expect(imMain).toContain("import { login as loginTenantSession, getCurrentUser } from '../../../packages/web-core/src/services/authService.js'");
    expect(posMain).toContain("import { login as loginTenantSession } from '../../../packages/web-core/src/services/authService.js'");
    expect(imMain).toContain('await loginTenantSession({');
    expect(posMain).toContain('await loginTenantSession({');
    expect(imMain).toContain("String(import.meta.env.VITE_DEV_AUTO_LOGIN_EMAIL || '').trim()");
    expect(imMain).toContain("String(import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD || '').trim()");
    expect(imMain).toContain("String(import.meta.env.VITE_DEV_AUTO_LOGIN_COMPANY_TOKEN || '').trim()");
    expect(imMain).not.toMatch(/VITE_DEV_AUTO_LOGIN_(?:EMAIL|PASSWORD|COMPANY_TOKEN)\s*\|\|\s*['"][^'"]+['"]/);
    expect(posMain).not.toMatch(/VITE_POS_DEV_(?:EMAIL|PASSWORD|COMPANY_TOKEN)\s*\|\|\s*['"][^'"]+['"]/);
    expect(imMain).not.toMatch(/const\s+(?:AUTO_EMAIL|AUTO_PASSWORD|COMPANY_TOKEN)\s*=\s*['"]/);
    expect(posMain).not.toMatch(/const\s+(?:AUTO_EMAIL|AUTO_PASSWORD|COMPANY_TOKEN)\s*=\s*['"]/);
    expect(imMain).not.toContain('/auth/login`, {');
    expect(posMain).not.toContain('/auth/login`, {');
  });

  it('routes browser-session bootstrap through the shared runtime API resolver', () => {
    const browserSession = readSource(
      path.join(repoRoot, 'packages', 'web-core', 'src', 'services'),
      'browserSession.js'
    );

    expect(browserSession).toContain("import { resolveApiBaseUrl } from '../utils/runtimeConfig.js';");
    expect(browserSession).toContain('const getApiBaseUrl = () => resolveApiBaseUrl(');
    expect(browserSession).not.toContain('const resolveApiBaseUrl = () =>');
    expect(browserSession).toContain("${getApiBaseUrl()}/auth/csrf-token");
    expect(browserSession).toContain("${getApiBaseUrl()}/auth/refresh-token");
  });

  it('does not embed repository tenant, terminal, or localhost runtime defaults in the desktop shell', () => {
    const main = readSource(desktopRoot, 'main.cjs');
    const readme = readSource(desktopRoot, 'README.md');
    const setup = readSource(desktopRoot, 'setup.html');

    expect(main).toContain('process.env.POS_ELECTRON_BACKEND_ORIGIN || \'\'');
    expect(main).toContain('process.env.POS_ELECTRON_COMPANY_TOKEN || \'\'');
    expect(main).toContain('process.env.POS_ELECTRON_TERMINAL_ID || \'\'');
    expect(main).not.toContain("|| 'token-original'");
    expect(main).not.toContain("|| 'COUNTER-01'");
    expect(readme).not.toContain('token-original');
    expect(setup).not.toContain('token-original');
  });

  it('resolves AI export downloads through the shared API base without a localhost fallback', () => {
    const exportDialog = readSource(
      path.join(repoRoot, 'packages', 'web-core', 'Components', 'ai'),
      'ExportOptionsDialog.jsx'
    );

    expect(exportDialog).toContain('resolveApiBaseUrl');
    expect(exportDialog).not.toContain('http://localhost:5000');
    expect(exportDialog).toContain("window.open(targetUrl, '_blank', 'noopener,noreferrer')");
  });
});

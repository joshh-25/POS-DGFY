import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// src/main.jsx stayed behind in apps/dgfy-web when the shared trunk moved into
// packages/web-core; apps/dgfy-pos/src/main.jsx is its own sibling app (issue #322 Phase 4)
// -- see docs/architecture/frontend-split-sync.md.
const appsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../apps');
const appRoot = path.join(appsRoot, 'dgfy-web');
const posRoot = path.join(appsRoot, 'dgfy-pos');
const readSource = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('browser entrypoint session helper contract', () => {
  it('keeps IMS and POS dev auto-login on the shared tenant login/session service', () => {
    const imMain = readSource(appRoot, 'src/main.jsx');
    const posMain = readSource(posRoot, 'src/main.jsx');

    expect(imMain).toContain("import { login as loginTenantSession, getCurrentUser } from '../../../packages/web-core/src/services/authService.js'");
    expect(posMain).toContain("import { login as loginTenantSession } from '../../../packages/web-core/src/services/authService.js'");
    expect(imMain).toContain('await loginTenantSession({');
    expect(posMain).toContain('await loginTenantSession({');
    expect(imMain).not.toContain('/auth/login`, {');
    expect(posMain).not.toContain('/auth/login`, {');
  });
});

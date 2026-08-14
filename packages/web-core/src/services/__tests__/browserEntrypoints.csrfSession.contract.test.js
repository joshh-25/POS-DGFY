import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Both reads below (src/main.jsx, apps/pos/src/main.jsx) target files that stayed behind in
// apps/dgfy-web when the shared trunk moved into packages/web-core -- see
// docs/architecture/frontend-split-sync.md.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../apps/dgfy-web');
const readSource = (file) => fs.readFileSync(path.join(appRoot, file), 'utf8');

describe('browser entrypoint session helper contract', () => {
  it('keeps IMS and POS dev auto-login on the shared tenant login/session service', () => {
    const imMain = readSource('src/main.jsx');
    const posMain = readSource('apps/pos/src/main.jsx');

    expect(imMain).toContain("import { login as loginTenantSession, getCurrentUser } from '../../../packages/web-core/src/services/authService.js'");
    expect(posMain).toContain("import { login as loginTenantSession } from '../../../../../packages/web-core/src/services/authService.js'");
    expect(imMain).toContain('await loginTenantSession({');
    expect(posMain).toContain('await loginTenantSession({');
    expect(imMain).not.toContain('/auth/login`, {');
    expect(posMain).not.toContain('/auth/login`, {');
  });
});

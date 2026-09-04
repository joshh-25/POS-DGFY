import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// This package's own root (src/, Components/) -- Layout.jsx stayed behind in apps/dgfy-ims
// when the shared trunk moved into packages/web-core, see docs/architecture/frontend-split-sync.md.
const packageRoot = path.resolve(__dirname, '../../../..');
const appRoot = path.resolve(__dirname, '../../../../../../apps/dgfy-ims');

const read = (relativePath) => fs.readFileSync(path.join(packageRoot, relativePath), 'utf8');
const readFromApp = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

describe('tenant capability notice shell contract', () => {
  it('keeps IMS layout subscribed to tenant capability block events', () => {
    const layout = readFromApp('Layout.jsx');
    expect(layout).toContain("window.addEventListener('tenant:capability-blocked'");
    expect(layout).toContain('<TenantCapabilityNotice');
  });

  it('keeps POS terminal layout subscribed to POS capability block events', () => {
    const terminalLayout = read('src/features/pos/components/TerminalPageLayout.jsx');
    expect(terminalLayout).toContain("window.addEventListener('tenant:capability-blocked'");
    expect(terminalLayout).toContain("detail.capability !== 'tenant_pos_enabled'");
    expect(terminalLayout).toContain('capabilityNotice &&');
    expect(terminalLayout).toContain('Reason code: {capabilityNotice.code}');
    expect(terminalLayout).toContain('setCapabilityNotice(null)');
  });
});

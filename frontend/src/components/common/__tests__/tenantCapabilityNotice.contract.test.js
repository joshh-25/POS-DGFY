import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('tenant capability notice shell contract', () => {
  it('keeps IMS layout subscribed to tenant capability block events', () => {
    const layout = read('Layout.jsx');
    expect(layout).toContain("window.addEventListener('tenant:capability-blocked'");
    expect(layout).toContain('<TenantCapabilityNotice');
  });

  it('keeps POS terminal layout subscribed to POS capability block events', () => {
    const terminalLayout = read('src/features/pos/components/TerminalPageLayout.jsx');
    expect(terminalLayout).toContain("window.addEventListener('tenant:capability-blocked'");
    expect(terminalLayout).toContain("detail.capability !== 'tenant_pos_enabled'");
    expect(terminalLayout).toContain('<TenantCapabilityNotice');
  });
});

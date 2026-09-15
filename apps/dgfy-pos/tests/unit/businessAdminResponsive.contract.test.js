import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminCss = fs.readFileSync(
  path.resolve(__dirname, '../../src/features/businessAdmin/businessAdmin.css'),
  'utf8'
);

describe('Business Admin responsive layout contract', () => {
  it('keeps the settings editor usable through tablet and mobile breakpoints', () => {
    expect(businessAdminCss).toContain('@media (max-width: 900px)');
    expect(businessAdminCss).toContain('.business-admin-settings-layout { grid-template-columns: minmax(0, 1fr); }');
    expect(businessAdminCss).toContain('@media (max-width: 680px)');
    expect(businessAdminCss).toContain('.business-admin-shell { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-settings-context-grid { grid-template-columns: 1fr; }');
  });

  it('keeps dense branch/admin tables horizontally scrollable on narrow screens', () => {
    expect(businessAdminCss).toContain('.business-admin-table-wrap { width: 100%; overflow-x: auto; }');
    expect(businessAdminCss).toContain('.business-admin-table { width: 100%; min-width: 560px;');
  });
});

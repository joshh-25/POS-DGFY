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
    expect(businessAdminCss).toContain('.business-admin-settings-layout { display: grid; grid-template-columns: minmax(0, 1fr);');
    expect(businessAdminCss).toContain('.business-admin-settings-section-list { display: flex;');
    expect(businessAdminCss).toContain('.business-admin-settings-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }');
    expect(businessAdminCss).toContain('overflow-x: auto;');
    expect(businessAdminCss).toContain('scroll-snap-type: x proximity;');
    expect(businessAdminCss).toContain('.business-admin-settings-nav-control');
    expect(businessAdminCss).toContain('.business-admin-settings-workspace { display: grid; gap: 12px; }');
    expect(businessAdminCss).toContain('.business-admin-settings-compact-copy');
    expect(businessAdminCss).toContain('.business-admin-settings-terminal-link');
    expect(businessAdminCss).toContain('.business-admin-settings-editor .business-admin-storefront-pane');
    expect(businessAdminCss).toContain('.business-admin-settings-editor .business-admin-storefront-save-bar');
    expect(businessAdminCss).toContain('@media (max-width: 680px)');
    expect(businessAdminCss).toContain('.business-admin-shell { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-settings-context-grid { grid-template-columns: 1fr; }');
  });

  it('keeps the storefront save action in normal document flow', () => {
    const saveBarRule = businessAdminCss.match(
      /\.business-admin-settings-editor \.business-admin-storefront-save-bar \{([\s\S]*?)\n\}/
    )?.[1] || '';
    expect(saveBarRule).toContain('display: flex;');
    expect(saveBarRule).toContain('border-top: 1px solid');
    expect(saveBarRule).not.toContain('position: sticky');
    expect(saveBarRule).not.toContain('backdrop-filter');
  });

  it('keeps dense branch/admin tables horizontally scrollable on narrow screens', () => {
    expect(businessAdminCss).toContain('.business-admin-table-wrap { width: 100%; overflow-x: auto; }');
    expect(businessAdminCss).toContain('.business-admin-table { width: 100%; min-width: 560px;');
  });

  it('keeps the Branches workspace visually responsive', () => {
    expect(businessAdminCss).toContain('.business-admin-branches-workspace { display: grid; gap: 16px; }');
    expect(businessAdminCss).toContain('.business-admin-branches-summary { display: grid;');
    expect(businessAdminCss).toContain('.business-admin-branch-grid { display: grid;');
    expect(businessAdminCss).toContain('.business-admin-branches-company-table .business-admin-table-wrap::-webkit-scrollbar');
    expect(businessAdminCss).toContain('.business-admin-branches-company-cards { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-branches-filter-card');
    expect(businessAdminCss).toContain('@media (max-width: 900px)');
    expect(businessAdminCss).toContain('.business-admin-branch-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
    expect(businessAdminCss).toContain('.business-admin-branch-grid { grid-template-columns: minmax(0, 1fr); padding: 12px; }');
    expect(businessAdminCss).toContain('.business-admin-branches-company-table { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-branches-company-cards { display: grid; gap: 8px; padding: 12px; }');
  });

  it('keeps the Shifts & cash workspace readable across breakpoints', () => {
    expect(businessAdminCss).toContain('.business-admin-shifts-workspace { display: grid; gap: 16px; }');
    expect(businessAdminCss).toContain('.business-admin-shifts-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));');
    expect(businessAdminCss).toContain('.business-admin-shifts-table-view { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-shifts-mobile-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-shifts-table-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-shifts-mobile-view { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-shift-card-facts { grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('keeps the Orders workspace readable while preserving the desktop table', () => {
    expect(businessAdminCss).toContain('.business-admin-orders-workspace { display: grid; gap: 16px; }');
    expect(businessAdminCss).toContain('.business-admin-orders-table-view { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-orders-mobile-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-orders-table-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-orders-mobile-view { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-order-card-facts { grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(businessAdminCss).toContain('.business-admin-orders-pagination {');
    expect(businessAdminCss).toContain('display: flex;');
    expect(businessAdminCss).toContain('.business-admin-orders-pagination-actions .business-admin-button');
    expect(businessAdminCss).toContain('.business-admin-orders-pagination { align-items: stretch; flex-direction: column;');
  });

  it('keeps the Payments workspace readable while preserving the desktop table', () => {
    expect(businessAdminCss).toContain('.business-admin-payments-workspace { display: grid; gap: 16px; }');
    expect(businessAdminCss).toContain('.business-admin-payments-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(businessAdminCss).toContain('.business-admin-payments-table-view { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-payments-mobile-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-payments-table-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-payments-mobile-view { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-payment-card-facts { grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(businessAdminCss).toContain('.business-admin-payment-account-grid { grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});

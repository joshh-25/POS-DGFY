import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS Add Items desktop modal', () => {
  it('matches the desktop wireframe while keeping create data backend-driven', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('Product Details');
    expect(workspace).toContain('max-w-[54rem]');
    expect(workspace).toContain('xl:grid-cols-[12rem_minmax(0,1fr)_12rem]');
    expect(workspace).toContain('min-h-[10rem]');
    expect(workspace).toContain('compact = false');
    expect(workspace).toContain('Product Barcode');
    expect(workspace).toContain('border-[#C7DCF3] bg-[#EEF5FF]');
    expect(workspace).toContain('-mx-px -mt-px flex shrink-0 items-center justify-between gap-3 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D]');
    expect(workspace).not.toContain('Active Item</span>');
    expect(workspace).toContain('Always Available');
    expect(workspace).toContain('Best Seller');
    expect(workspace).toContain('Senior/PWD Eligible');
    expect(workspace).toContain('getPosItemStatusSwitchClass');
    expect(workspace).toContain('pos-items-status-switch');
    expect(workspace).toContain('bg-[#1A4E8D] hover:bg-[#143F73] focus-visible:ring-[#2563EB]');
    expect(workspace).toContain('Add Options');
    expect(workspace).toContain('data-testid="pos-items-create-options-list"');
    expect(workspace).toContain('max-h-40 min-h-32');
    expect(workspace).toContain('overflow-y-auto');
    expect(workspace).toContain('listFnbModifierGroups({ include_inactive: false })');
    expect(workspace).toContain('replaceFnbItemModifierGroups(itemId');
    expect(workspace).toContain('option.name');
    expect(workspace).toContain('option.price.toFixed(2)');
    expect(workspace).not.toContain('Option Name');
    expect(workspace).not.toContain('P20.00');
  });
});

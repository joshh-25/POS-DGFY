import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS item catalog barcode loading', () => {
  it('uses the catalog primary barcode instead of requesting barcode data per item', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('item?.primary_barcode');
    expect(workspace).not.toContain('listItemBarcodes');
    expect(workspace).not.toContain('Promise.allSettled(normalizedItems.map');
  });
});

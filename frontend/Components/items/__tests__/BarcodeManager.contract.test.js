import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const barcodeManagerPath = path.resolve(__dirname, '../BarcodeManager.jsx');

describe('BarcodeManager contract', () => {
  const source = fs.readFileSync(barcodeManagerPath, 'utf8');

  it('keeps all label types selectable and renders backend label layout metadata', () => {
    expect(source).toContain('const LABEL_TYPE_OPTIONS = [');
    for (const labelType of ['item', 'shelf', 'package', 'case', 'batch', 'service', 'ticket', 'booking']) {
      expect(source).toContain(`['${labelType}'`);
    }
    expect(source).toContain('payload?.print_contract?.layout');
    expect(source).toContain('display.label_title');
    expect(source).toContain('display.purpose');
    expect(source).toContain('layout.width_mm');
    expect(source).toContain('layout.height_mm');
  });

  it('keeps package-alias conflict action guarded by quantity multiplier', () => {
    expect(source).toContain("handleResolveConflict('add_package_alias')");
    expect(source).toContain('Number(form.quantity_multiplier || 1) <= 1');
  });
});

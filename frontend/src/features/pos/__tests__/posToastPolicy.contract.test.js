import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = path.resolve(__dirname, '../../../..');
const posToasterSource = fs.readFileSync(
  path.resolve(frontendRoot, 'apps/pos/src/components/PosToaster.jsx'),
  'utf8'
);
const posMainSource = fs.readFileSync(
  path.resolve(frontendRoot, 'apps/pos/src/main.jsx'),
  'utf8'
);
const posAppSource = fs.readFileSync(
  path.resolve(frontendRoot, 'apps/pos/src/app/PosApp.jsx'),
  'utf8'
);

describe('standalone POS toast policy', () => {
  it('silences normal, success, and info notifications', () => {
    expect(posToasterSource).toContain("default: 'hidden'");
    expect(posToasterSource).toContain("success: 'hidden'");
    expect(posToasterSource).toContain("info: 'hidden'");
  });

  it('does not silence warning or error notifications', () => {
    expect(posToasterSource).not.toMatch(/(?:warning|error):\s*['\"]hidden['\"]/);
  });

  it('uses the POS-specific toaster in both standalone app entry points', () => {
    expect(posMainSource).toContain('<PosToaster />');
    expect(posAppSource).toContain('<PosToaster />');
  });
});

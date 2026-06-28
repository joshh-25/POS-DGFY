import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('POS setup flow', () => {
  it('keeps DGFY sign-in and company selection before secure terminal pairing', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../pages/TerminalPage.jsx'), 'utf8');
    expect(source.indexOf('await loginDgfyAccount')).toBeLessThan(source.indexOf('await listDgfyAccountCompanies'));
    expect(source.indexOf('await listDgfyAccountCompanies')).toBeLessThan(source.indexOf('await startDgfyPosSession'));
    expect(source.indexOf('await startDgfyPosSession')).toBeLessThan(source.indexOf('await pairPosTerminal'));
  });
});

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const terminalLayoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const posCheckoutPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');

describe('POS terminal responsive scroll contracts', () => {
  let terminalLayoutContent = '';
  let posCheckoutContent = '';

  beforeAll(() => {
    terminalLayoutContent = fs.readFileSync(terminalLayoutPath, 'utf8');
    posCheckoutContent = fs.readFileSync(posCheckoutPath, 'utf8');
  });

  it('keeps terminal shell viewport-safe and avoids hard xl screen lock', () => {
    expect(terminalLayoutContent).toContain('min-h-[100dvh]');
    expect(terminalLayoutContent).not.toContain('xl:h-screen');
  });

  it('keeps checkout panes shrink-safe and avoids legacy 100vh calc sizing', () => {
    expect(posCheckoutContent).toContain('min-h-0 overflow-hidden');
    expect(posCheckoutContent).toContain('splitPaneScrollClassName');
    expect(posCheckoutContent).not.toContain('calc(100vh-13.5rem)');
  });

  it('pins current-sale terminal actions with sticky footer controls', () => {
    expect(posCheckoutContent).toContain('sticky bottom-0 grid grid-cols-1 gap-2');
    expect(posCheckoutContent).toContain('Checkout');
    expect(posCheckoutContent).toContain('Close Day / Z-Reading');
  });
});


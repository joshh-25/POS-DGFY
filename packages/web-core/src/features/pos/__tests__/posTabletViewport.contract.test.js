import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readPosSource = (relativePath) => fs.readFileSync(path.resolve(posRoot, relativePath), 'utf8');

const terminalPageSource = readPosSource('pages/TerminalPage.jsx');
const catalogWorkflowSource = readPosSource('hooks/usePosCatalogWorkflow.js');
const historySource = readPosSource('components/POSTransactionHistoryPanel.jsx');
const tabletViewportSource = readPosSource('utils/posTabletViewport.js');

describe('POS tablet viewport ownership', () => {
  it('uses one classifier for the shell, item catalog, and transaction history', () => {
    expect(terminalPageSource).toContain("import { isPosTabletViewport } from '../utils/posTabletViewport.js';");
    expect(catalogWorkflowSource).toContain("import { isPosTabletViewport } from '../utils/posTabletViewport.js';");
    expect(historySource).toContain("import { isPosTabletViewport } from '../utils/posTabletViewport.js';");
    expect(tabletViewportSource).toContain('isIminWrapperRuntime(windowObj)');
  });

  it('does not restore conflicting component-specific tablet media queries', () => {
    expect(catalogWorkflowSource).not.toContain("'(min-width: 640px) and (max-width: 1023px)'");
    expect(historySource).not.toContain("'(min-width: 768px) and (max-width: 1279px)'");
    expect(terminalPageSource).not.toContain('TABLET_TERMINAL_MAX_WIDTH_PX');
  });
});

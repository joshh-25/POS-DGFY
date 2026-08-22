import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const componentRoot = path.resolve(webCoreRoot, 'src/features/pos/components');
const shellSource = fs.readFileSync(path.join(componentRoot, 'POSCheckoutTerminal.jsx'), 'utf8');
const viewSource = fs.readFileSync(path.join(componentRoot, 'POSCheckoutTerminalView.jsx'), 'utf8');
const receiptDialogsSource = fs.readFileSync(path.join(componentRoot, 'POSCheckoutTerminalReceiptDialogs.jsx'), 'utf8');

describe('POS checkout terminal orchestration shell contract', () => {
  it('keeps the public terminal component as a compatibility shell', () => {
    expect(shellSource).toContain("const POSCheckoutTerminalView = lazyWithChunkRetry(() => import('./POSCheckoutTerminalView.jsx'));");
    expect(shellSource).toContain('const terminalViewModel = {');
    expect(shellSource).toContain('<POSCheckoutTerminalView viewModel={terminalViewModel} />');
    expect(shellSource).toContain('<Suspense fallback=');
    expect(shellSource).not.toContain('<section');
    expect(shellSource).not.toContain('<Dialog');
    expect(shellSource).not.toContain('<POSTransactionHistoryPanel');
    const effectiveLineCount = shellSource
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .length;
    expect(effectiveLineCount).toBeLessThanOrEqual(1500);
  });

  it('keeps stable rendered DOM/test-ID ownership in the extracted view', () => {
    expect(viewSource).toContain('data-testid="pos-catalog-scroll"');
    expect(viewSource).toContain('data-testid="pos-clear-current-sale-dialog"');
        expect(receiptDialogsSource).toContain('data-testid="pos-receipt-modal-open-pos-report"');
    expect(viewSource).toContain('data-testid="pos-header-parked-sales-history-button"');
    expect(viewSource).toContain('aria-label="POS catalog contents"');
    expect(viewSource).toContain('aria-label="Current sale contents"');
  });

  it('keeps business/API ownership out of the presentation view', () => {
    expect(viewSource).not.toContain('fetchPos');
    expect(viewSource).not.toContain('createPos');
    expect(viewSource).not.toContain('updatePos');
    expect(viewSource).not.toContain('voidPos');
    expect(viewSource).not.toContain('usePosCheckoutWorkflow');
    expect(viewSource).not.toContain('usePosFinancialWorkflow');
  });
});

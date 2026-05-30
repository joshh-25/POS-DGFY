import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const posCheckoutPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');
const skupervisorCheckoutPath = path.resolve(__dirname, '../components/SkupervisorPOSCheckoutTerminal.jsx');

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');

describe('POS checkout surface parity', () => {
  const posSource = readSource(posCheckoutPath);
  const skupervisorSource = readSource(skupervisorCheckoutPath);

  it('uses the shared checkout payload and fee contract in both checkout surfaces', () => {
    for (const source of [posSource, skupervisorSource]) {
      expect(source).toContain('buildPosCheckoutPayload');
      expect(source).toContain('DGFY_CONVENIENCE_FEE_LABEL');
      expect(source).toContain('DGFY_CONVENIENCE_FEE_RATE');
      expect(source).toContain('createPosCheckout(payload)');
      expect(source).toContain('markTerminalOperationReplayed(payload.idempotency_key');
    }
  });

  it('keeps critical checkout, receipt, scan, history, and replay capabilities on both surfaces', () => {
    const requiredTokens = [
      'ReceiptPrintView',
      'POSBarcodeScanner',
      'POSTransactionHistoryPanel',
      'enqueueTerminalOperationIntent',
      'getReplayCandidateEntries',
      'TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED',
      'Replay queued checkouts',
      'Replay in Sync Queue',
      'fetchPosTransactionById',
      'openInSalesReport',
      "params.set('pos_order_source', historyOrderSource);",
      'buildCompliancePolicyBlockerMessage',
      'FNB_RECIPE_INGREDIENT_SHORTFALL',
      'FNB_RECIPE_UOM_INCOMPATIBLE',
      'FNB_KITCHEN_ORDER_UNAVAILABLE',
      'scan_metadata',
      'line_modifiers',
      'terminal_identity_policy'
    ];

    for (const token of requiredTokens) {
      expect(posSource, `standalone POS missing ${token}`).toContain(token);
      expect(skupervisorSource, `SKUpervisor POS missing ${token}`).toContain(token);
    }
  });

  it('documents intentional UI differences while preserving shared business payload behavior', () => {
    expect(posSource).toContain('IS_DGFY_POS_SURFACE');
    expect(posSource).toContain('Total Payment');
    expect(posSource).toContain('{customerPaymentFieldLabel} must be at least PHP');
    expect(skupervisorSource).toContain('usePermission');
    expect(skupervisorSource).toContain('handlePaneScrollKeyDown');
    expect(skupervisorSource).toContain('SkupervisorPOSBarcodeScanner.jsx');
    expect(skupervisorSource).toContain('SkupervisorPOSTransactionHistoryPanel.jsx');
  });
});

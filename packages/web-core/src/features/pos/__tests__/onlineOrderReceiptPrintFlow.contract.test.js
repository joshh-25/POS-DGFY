import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(testDirectory, '../pages/TerminalPage.jsx'), 'utf8');
const posServiceSource = fs.readFileSync(path.resolve(testDirectory, '../services/posService.js'), 'utf8');

describe('online customer receipt print flow', () => {
  it('claims the prepaid receipt at cashier confirmation instead of printing at completion', () => {
    expect(terminalPageSource).toContain("if (nextStatus === 'confirmed')");
    expect(terminalPageSource).toContain('requireAutomaticClaim: true');
    expect(terminalPageSource).toContain("reason: 'online_order_acceptance_receipt'");
    expect(terminalPageSource).not.toContain("if (nextStatus === 'completed') {\n        try {\n          await printOnlineOrderReceiptById");
  });

  it('uses the server-controlled atomic claim endpoint before automatic printing', () => {
    expect(posServiceSource).toContain("api.post('/pos/device/online-order-receipt-claim'");
    expect(terminalPageSource).toContain('claimOnlineOrderReceiptAutoPrint({');
  });
});

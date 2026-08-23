import fs from 'fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../components/SkupervisorPOSTransactionHistoryPanel.jsx', import.meta.url), 'utf8');

describe('SKUpervisor-linked POS history receipt status contract', () => {
  it('does not render receipt print status as a sales-list badge', () => {
    expect(source).not.toContain('receipt_print_status');
    expect(source).not.toContain('Receipt Pending');
    expect(source).toContain('Payment');
    expect(source).toContain('View');
    expect(source).toContain('Receipt');
  });
});

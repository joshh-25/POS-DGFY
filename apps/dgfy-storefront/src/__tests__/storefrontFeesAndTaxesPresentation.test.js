import { describe, expect, it } from 'vitest';
import {
  VAT_DISCLOSURE_LABEL,
  VAT_DISCLOSURE_NOTE,
  buildFeeAndVatSummaryRows
} from '../shared/model/storefrontFeesAndTaxesPresentation.js';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

describe('buildFeeAndVatSummaryRows', () => {
  it('returns [] when money is not a function (never throw on a missing formatter)', () => {
    expect(buildFeeAndVatSummaryRows({ totals: { service_fee_amount: 1, vat_amount: 1 } })).toEqual([]);
  });

  it('zero fee (revenue sharing) + nonzero VAT -- the fee row still renders at PHP 0.00, VAT is unaffected', () => {
    const rows = buildFeeAndVatSummaryRows({
      totals: { service_fee_amount: 0, vat_amount: 11.25 },
      money
    });
    expect(rows).toEqual([
      { label: 'Service Fee', value: 'PHP 0.00' },
      { label: VAT_DISCLOSURE_LABEL, value: 'PHP 11.25' }
    ]);
  });

  it('nonzero (1%) fee + nonzero VAT', () => {
    const rows = buildFeeAndVatSummaryRows({
      totals: { service_fee_amount: 1.05, vat_amount: 11.25 },
      money
    });
    expect(rows).toEqual([
      { label: 'Service Fee', value: 'PHP 1.05' },
      { label: VAT_DISCLOSURE_LABEL, value: 'PHP 11.25' }
    ]);
  });

  it('VAT-exempt: vat_amount 0 renders the VAT row at PHP 0.00, not hidden', () => {
    const rows = buildFeeAndVatSummaryRows({
      totals: { service_fee_amount: 1.05, vat_amount: 0 },
      money
    });
    expect(rows[1]).toEqual({ label: VAT_DISCLOSURE_LABEL, value: 'PHP 0.00' });
  });

  it('missing service_fee_label falls back to "Service Fee"', () => {
    const rows = buildFeeAndVatSummaryRows({
      totals: { service_fee_amount: 1.05, vat_amount: 11.25 },
      money
    });
    expect(rows[0].label).toBe('Service Fee');
  });

  it('present service_fee_label is used verbatim (ADR 0012 Decision 1 label snapshot)', () => {
    const rows = buildFeeAndVatSummaryRows({
      totals: { service_fee_amount: 1.05, vat_amount: 11.25, service_fee_label: 'DGFY convenience fee' },
      money
    });
    expect(rows[0].label).toBe('DGFY convenience fee');
  });

  it('missing totals defaults every figure to 0 rather than throwing or rendering NaN', () => {
    expect(buildFeeAndVatSummaryRows({ money })).toEqual([
      { label: 'Service Fee', value: 'PHP 0.00' },
      { label: VAT_DISCLOSURE_LABEL, value: 'PHP 0.00' }
    ]);
  });
});

describe('VAT_DISCLOSURE_NOTE', () => {
  it('is a non-empty string documenting the pre-discount VAT basis', () => {
    expect(typeof VAT_DISCLOSURE_NOTE).toBe('string');
    expect(VAT_DISCLOSURE_NOTE.length).toBeGreaterThan(0);
    expect(VAT_DISCLOSURE_NOTE).toMatch(/promo or voucher/i);
  });
});

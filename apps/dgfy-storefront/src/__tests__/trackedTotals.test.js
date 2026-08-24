import { describe, expect, it } from 'vitest';
import { resolveTrackedTotals } from '../shared/model/trackedTotals.js';

// Phase 142 (#823): extracted from a verbatim duplicate previously living in both
// shared/hooks/useCheckoutSubmission.js and modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js
// -- widened to overlay amount_paid/balance_due (previously silently discarded) alongside the
// pre-existing total_amount overlay.
describe('resolveTrackedTotals', () => {
  const fallbackTotals = { total_amount: 999, subtotal_amount: 900, delivery_fee: 0 };

  it('overlays the server order total when present, keeping the rest of the fallback', () => {
    const result = resolveTrackedTotals({ total_amount: 505 }, fallbackTotals);
    expect(result.total_amount).toBe(505);
    expect(result.subtotal_amount).toBe(900);
  });

  it('keeps the fallback total when the order has none', () => {
    const result = resolveTrackedTotals(null, fallbackTotals);
    expect(result.total_amount).toBe(999);
  });

  it('overlays amount_paid/balance_due from the order', () => {
    const result = resolveTrackedTotals({ total_amount: 505, amount_paid: 101, balance_due: 404 }, fallbackTotals);
    expect(result.amount_paid).toBe(101);
    expect(result.balance_due).toBe(404);
  });

  it('defaults amount_paid/balance_due to null for a full_payment order (additive-only)', () => {
    const result = resolveTrackedTotals({ total_amount: 505 }, fallbackTotals);
    expect(result.amount_paid).toBeNull();
    expect(result.balance_due).toBeNull();
  });
});

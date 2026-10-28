import { describe, expect, it } from 'vitest';
import { shouldBlockNewCheckout } from '../workflowReadiness.js';

describe('shouldBlockNewCheckout', () => {
  it('blocks a new sale when the workflow has no resolved source', () => {
    expect(shouldBlockNewCheckout({ workflowUnresolved: true })).toBe(true);
  });

  it('allows settlement when an existing F&B check supplies its method', () => {
    expect(shouldBlockNewCheckout({
      workflowUnresolved: true,
      hasFnbCheckoutContext: true
    })).toBe(false);
  });

  it('allows an existing dine-in checkout to settle', () => {
    expect(shouldBlockNewCheckout({
      workflowUnresolved: true,
      isExistingDineInCheckout: true
    })).toBe(false);
  });

  it('does not block after the workflow resolves', () => {
    expect(shouldBlockNewCheckout({ workflowUnresolved: false })).toBe(false);
  });
});

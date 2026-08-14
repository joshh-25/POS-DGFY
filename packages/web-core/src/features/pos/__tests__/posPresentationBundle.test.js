import { describe, expect, it } from 'vitest';
import { resolvePosWorkflow } from '../utils/posWorkflowResolver.js';
import {
  POS_PRESENTATION_BUNDLES,
  POS_PRESENTATION_SLOT_OWNERS,
  resolvePosPresentationBundle
} from '../utils/posPresentationBundle.js';

describe('resolvePosPresentationBundle', () => {
  it('maps governed F&B, Services, and Counter workflows to their presentation owners', () => {
    const fnb = resolvePosPresentationBundle(resolvePosWorkflow('fnb'));
    const services = resolvePosPresentationBundle(resolvePosWorkflow('services'));
    const counter = resolvePosPresentationBundle(resolvePosWorkflow('retail'));

    expect(fnb).toBe(POS_PRESENTATION_BUNDLES.fnb);
    expect(fnb.slots.checkoutDetails).toBe(POS_PRESENTATION_SLOT_OWNERS.FNB);
    expect(services).toBe(POS_PRESENTATION_BUNDLES.services);
    expect(services.slots.checkoutDetails).toBe(POS_PRESENTATION_SLOT_OWNERS.SERVICES);
    expect(counter).toBe(POS_PRESENTATION_BUNDLES.counter);
    expect(counter.slots.checkoutDetails).toBe(POS_PRESENTATION_SLOT_OWNERS.COUNTER);
  });

  it('uses the Counter bundle for a counter-service F&B profile', () => {
    const workflow = resolvePosWorkflow('fnb', []);
    expect(workflow.mode).toBe('counter');
    expect(resolvePosPresentationBundle(workflow)).toBe(POS_PRESENTATION_BUNDLES.counter);
  });

  it('preserves the existing Hospitality presentation until its own contract exists', () => {
    const workflow = resolvePosWorkflow('hospitality');
    expect(workflow.mode).toBe('fnb');
    expect(resolvePosPresentationBundle(workflow)).toBe(POS_PRESENTATION_BUNDLES.fnb);
  });

  it('fails closed to Counter for unknown or incomplete presentation input', () => {
    [null, undefined, {}, { mode: 'fnb' }, { mode: 'services' }, {
      mode: 'unknown',
      transactionRecord: 'order',
      allowedMethods: ['walk_in'],
      capabilities: {}
    }].forEach((input) => {
      const bundle = resolvePosPresentationBundle(input);
      expect(bundle).toBe(POS_PRESENTATION_BUNDLES.counter);
      expect(bundle.slots.checkoutDetails).not.toBe(POS_PRESENTATION_SLOT_OWNERS.FNB);
      expect(bundle.slots.checkoutDetails).not.toBe(POS_PRESENTATION_SLOT_OWNERS.SERVICES);
    });
  });

  it('keeps financial and infrastructure slots shared in every bundle', () => {
    Object.values(POS_PRESENTATION_BUNDLES).forEach((bundle) => {
      ['catalog', 'cart', 'checkout', 'payments', 'discounts', 'receipts', 'shifts', 'hardware']
        .forEach((slot) => expect(bundle.slots[slot]).toBe(POS_PRESENTATION_SLOT_OWNERS.SHARED));
      expect(bundle.slots.currentSaleActions).toBe(bundle.key);
    });
  });

  it('keeps parked-sale presentation in F&B and Counter but not Services', () => {
    expect(POS_PRESENTATION_BUNDLES.fnb.currentSaleActions.showParkedSaleControls).toBe(true);
    expect(POS_PRESENTATION_BUNDLES.counter.currentSaleActions.showParkedSaleControls).toBe(true);
    expect(POS_PRESENTATION_BUNDLES.services.currentSaleActions.showParkedSaleControls).toBe(false);
  });
});

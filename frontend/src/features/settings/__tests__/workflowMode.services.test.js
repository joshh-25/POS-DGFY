import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKFLOW_MODE,
  getWorkflowModeLabel,
  getWorkflowModePinMeta,
  isWorkflowPageVisible,
  isWorkflowPathBlocked,
  modeHasCapability,
  normalizeWorkflowMode
} from '../workflowMode.js';

describe('Services and Food Manufacturing workflow modes', () => {
  it('uses Food Manufacturing as the default and legacy manufacturing alias', () => {
    expect(DEFAULT_WORKFLOW_MODE).toBe('food_manufacturing');
    expect(normalizeWorkflowMode('manufacturing')).toBe('food_manufacturing');
    expect(getWorkflowModeLabel('manufacturing')).toBe('Food Manufacturing');
  });

  it('keeps Services navigation independent from manufacturing workflows', () => {
    expect(modeHasCapability('services', 'services')).toBe(true);
    expect(modeHasCapability('services', 'productionWorkflows')).toBe(false);
    expect(isWorkflowPageVisible('Services', 'services')).toBe(true);
    expect(isWorkflowPageVisible('JobOrders', 'services')).toBe(false);
    expect(isWorkflowPageVisible('Services', 'food_manufacturing')).toBe(false);
  });

  it('uses the planned pin metadata for Services and Food Manufacturing', () => {
    expect(getWorkflowModePinMeta('services').icon).toBe('CalendarCheck');
    expect(getWorkflowModePinMeta('food_manufacturing').icon).toBe('Factory');
  });

  it('keeps Food & Beverage restaurant-native and hides manufacturing production navigation', () => {
    expect(getWorkflowModeLabel('fnb')).toBe('Food & Beverage');
    expect(getWorkflowModePinMeta('fnb').icon).toBe('Utensils');
    expect(modeHasCapability('fnb', 'fnbDining')).toBe(true);
    expect(modeHasCapability('fnb', 'menuModifiers')).toBe(true);
    expect(modeHasCapability('fnb', 'tableService')).toBe(true);
    expect(modeHasCapability('fnb', 'kitchenQueue')).toBe(true);
    expect(modeHasCapability('fnb', 'restaurantServiceCharge')).toBe(true);
    expect(modeHasCapability('fnb', 'productionWorkflows')).toBe(false);
    expect(isWorkflowPageVisible('Fnb', 'fnb')).toBe(true);
    expect(isWorkflowPageVisible('Fnb', 'food_manufacturing')).toBe(false);
    expect(isWorkflowPageVisible('JobOrders', 'fnb')).toBe(false);
    expect(isWorkflowPageVisible('DispatchOrders', 'fnb')).toBe(false);
    expect(isWorkflowPathBlocked('/fnb', 'retail')).toBe(true);
    expect(isWorkflowPathBlocked('/job-orders', 'fnb')).toBe(true);
  });
});

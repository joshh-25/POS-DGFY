import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKFLOW_MODE,
  getWorkflowModeLabel,
  getWorkflowModePinMeta,
  isWorkflowPageVisible,
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
});

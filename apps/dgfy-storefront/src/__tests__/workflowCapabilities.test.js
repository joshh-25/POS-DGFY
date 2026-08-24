import { describe, expect, it } from 'vitest';
import { buildWorkflowCapabilityStorePatch } from '../shared/model/workflowCapabilities.js';

describe('buildWorkflowCapabilityStorePatch', () => {
  it('preserves the profile workflow mode when the catalog overlay omits it', () => {
    const profile = { workflow_mode: 'services' };
    const patch = buildWorkflowCapabilityStorePatch({ enabled_capabilities: [] });

    expect(patch).toEqual({ enabled_capabilities: [] });
    expect({ ...profile, ...patch }).toMatchObject({ workflow_mode: 'services' });
  });

  it('adds a supplied workflow mode and capabilities to the profile patch', () => {
    expect(buildWorkflowCapabilityStorePatch({
      workflow_mode: ' retail ',
      enabled_capabilities: ['services']
    })).toEqual({
      workflow_mode: 'retail',
      enabled_capabilities: ['services']
    });
  });

  it('returns no patch when the catalog response has no capability metadata', () => {
    expect(buildWorkflowCapabilityStorePatch({ items: [] })).toBeNull();
  });
});

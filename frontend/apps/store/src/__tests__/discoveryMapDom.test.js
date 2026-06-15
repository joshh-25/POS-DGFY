/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { getDiscoveryMarkerKey, makeClusterElement } from '../discoveryMapDom.js';

describe('discovery map DOM helpers', () => {
  it('keeps location identity before falling back to tenant-only marker identity', () => {
    expect(getDiscoveryMarkerKey({
      slug: 'alpha',
      location_id: 22,
      latitude: 10.72,
      longitude: 122.56
    })).toBe('alpha:loc:22');

    expect(getDiscoveryMarkerKey({
      slug: 'alpha',
      latitude: 10.7212344,
      longitude: 122.5678912
    })).toBe('alpha:coord:10.721234:122.567891');

    expect(getDiscoveryMarkerKey({
      marker_key: 'explicit-pin',
      slug: 'alpha',
      location_id: 22
    })).toBe('explicit-pin');
  });

  it('renders shared-coordinate cluster markers with the standard pin visual wrapper', () => {
    const element = makeClusterElement(7, true, '7 storefronts at this location');

    expect(element.classList.contains('discovery-result-cluster')).toBe(true);
    expect(element.classList.contains('is-selected')).toBe(true);
    expect(element.getAttribute('aria-label')).toBe('7 storefronts at this location');
    expect(element.querySelector('.discovery-result-cluster-visual')?.textContent).toBe('7');
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = () => fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');

describe('F&B order confirmation and tracking contract', () => {
  it('shows a confirmation handoff and direct tracking action after checkout', () => {
    const source = appSource();

    expect(source).toContain('Next update: Confirmed by store');
    expect(source).toContain('Fulfillment Handoff');
    expect(source).toContain('Open Tracking');
    expect(source).toContain('Delivery orders move from confirmation to preparing, then out for delivery.');
    expect(source).toContain('Pickup orders move from confirmation to preparing, then ready for pickup.');
  });

  it('renders a fulfillment timeline and order detail blocks in tracking', () => {
    const source = appSource();

    expect(source).toContain('Estimated arrival');
    expect(source).toContain('Order Details');
    expect(source).toContain('Delivery To');
    expect(source).toContain('Ready for pickup');
    expect(source).toContain('Out for delivery');
  });

  it('uses a map-first delivery location flow in the F&B customer step', () => {
    const source = appSource();

    expect(source).toContain('Pin Current Location');
    expect(source).toContain('Pin on Map');
    expect(source).toContain('Please pin your location in the map. Use maximize to enlarge the map.');
    expect(source).toContain('Open large map');
    expect(source).toContain('Add Location');
    expect(source).toContain('Saved location');
    expect(source).toContain('Resolving address from your pinned location...');
    expect(source).toContain('Delivery orders need a pinned map location.');
    expect(source).toContain('Pinned map location (');
  });
});

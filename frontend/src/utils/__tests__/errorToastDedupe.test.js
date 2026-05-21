import { describe, it, expect } from 'vitest';
import { createErrorToastDeduper } from '../errorToastDedupe.js';

describe('error toast deduper', () => {
  it('suppresses repeated messages inside cooldown window', () => {
    const deduper = createErrorToastDeduper(5000);

    expect(deduper.shouldSuppress('Server error', 1000)).toBe(false);
    expect(deduper.shouldSuppress('server error', 1500)).toBe(true);
    expect(deduper.shouldSuppress('Server error', 6501)).toBe(false);
  });

  it('tracks different messages independently', () => {
    const deduper = createErrorToastDeduper(5000);

    expect(deduper.shouldSuppress('Server A', 1000)).toBe(false);
    expect(deduper.shouldSuppress('Server B', 1200)).toBe(false);
    expect(deduper.shouldSuppress('Server A', 1300)).toBe(true);
  });
});


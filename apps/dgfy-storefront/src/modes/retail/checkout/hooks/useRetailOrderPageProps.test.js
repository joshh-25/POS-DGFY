import { describe, expect, it, vi } from 'vitest';
import { useRetailOrderPageProps } from './useRetailOrderPageProps.js';

// #1931: Retail's schedule selection used to live in RetailOrderPage.jsx's own
// local useState, which checkout submission never read -- a customer who picked
// "Schedule" was silently submitted as ASAP. The selection is now StorefrontApp.jsx's
// shared fnbScheduleMode/fnbScheduledFor state (the same instance F&B/Simple already
// submit via buildFnbCheckoutPayload.js), threaded through this hook. These cases pin
// that wiring: shared state in, shared setters out, with Simple's exact callback pairing.
describe('useRetailOrderPageProps schedule wiring (#1931)', () => {
  const baseParams = () => ({
    cart: [],
    selectedStore: null,
    storeLocations: [],
    selectedLocationId: null,
    setCartImageErrors: vi.fn()
  });

  it('exposes the shared schedule state as scheduleMode/scheduledFor', () => {
    const props = useRetailOrderPageProps({
      ...baseParams(),
      fnbScheduleMode: 'schedule',
      fnbScheduledFor: '2026-09-20T10:30',
      setFnbScheduleMode: vi.fn(),
      setFnbScheduledFor: vi.fn()
    });

    expect(props.scheduleMode).toBe('schedule');
    expect(props.scheduledFor).toBe('2026-09-20T10:30');
  });

  it('defaults to asap/empty when the shared state is absent', () => {
    const props = useRetailOrderPageProps({ ...baseParams() });

    expect(props.scheduleMode).toBe('asap');
    expect(props.scheduledFor).toBe('');
  });

  it('switching to asap clears the shared scheduled time', () => {
    const setFnbScheduleMode = vi.fn();
    const setFnbScheduledFor = vi.fn();
    const props = useRetailOrderPageProps({
      ...baseParams(),
      fnbScheduleMode: 'schedule',
      fnbScheduledFor: '2026-09-20T10:30',
      setFnbScheduleMode,
      setFnbScheduledFor
    });

    props.onScheduleModeChange('asap');

    expect(setFnbScheduleMode).toHaveBeenCalledWith('asap');
    expect(setFnbScheduledFor).toHaveBeenCalledWith('');
  });

  it('picking a time writes the shared value and forces schedule mode', () => {
    const setFnbScheduleMode = vi.fn();
    const setFnbScheduledFor = vi.fn();
    const props = useRetailOrderPageProps({
      ...baseParams(),
      fnbScheduleMode: 'asap',
      fnbScheduledFor: '',
      setFnbScheduleMode,
      setFnbScheduledFor
    });

    props.onScheduledForChange('2026-09-20T10:30');

    expect(setFnbScheduledFor).toHaveBeenCalledWith('2026-09-20T10:30');
    expect(setFnbScheduleMode).toHaveBeenCalledWith('schedule');
  });
});

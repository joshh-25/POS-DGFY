/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCustomerDashboardStorefrontBridge } from './useCustomerDashboardStorefrontBridge.js';

describe('useCustomerDashboardStorefrontBridge', () => {
  it('keeps selected-company Day Close actions available to route bindings', () => {
    const getOwnBusinessDayCloseStatus = vi.fn();
    const configureOwnBusinessDayClosePin = vi.fn();

    const { result } = renderHook(() => useCustomerDashboardStorefrontBridge({
      getOwnBusinessDayCloseStatus,
      configureOwnBusinessDayClosePin
    }));

    expect(result.current.sources.getOwnBusinessDayCloseStatus).toBe(getOwnBusinessDayCloseStatus);
    expect(result.current.sources.configureOwnBusinessDayClosePin).toBe(configureOwnBusinessDayClosePin);
  });
});

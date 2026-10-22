// @vitest-environment jsdom
import React, { useRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import usePosCenteredTabScroll from '../hooks/usePosCenteredTabScroll.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ScrollableTabRail({ activeTab }) {
  const viewportRef = useRef(null);
  usePosCenteredTabScroll(viewportRef, `tab-${activeTab}`);

  return (
    <div ref={viewportRef} data-testid="tab-viewport">
      <button id="tab-first" type="button">First</button>
      <button id="tab-middle" type="button">Middle</button>
      <button id="tab-last" type="button">Last</button>
    </div>
  );
}

const setRailMeasurements = (viewport, activeTab, { left, width = 80, scrollWidth = 1200, clientWidth = 300 }) => {
  Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(viewport, 'scrollLeft', { configurable: true, value: 200 });
  viewport.getBoundingClientRect = vi.fn(() => ({ left: 40, width: clientWidth }));
  viewport.scrollTo = vi.fn();
  document.getElementById(`tab-${activeTab}`).getBoundingClientRect = vi.fn(() => ({ left, width }));
};

const installAnimationFrame = () => {
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
};

describe('usePosCenteredTabScroll', () => {
  it('smoothly centers a selected tab when the rail overflows', () => {
    installAnimationFrame();
    const { rerender, getByTestId } = render(<ScrollableTabRail activeTab="first" />);
    const viewport = getByTestId('tab-viewport');
    setRailMeasurements(viewport, 'middle', { left: 250 });

    rerender(<ScrollableTabRail activeTab="middle" />);

    expect(viewport.scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });
  });

  it('scrolls to the nearest possible position for edge tabs instead of skipping them', () => {
    installAnimationFrame();
    const { rerender, getByTestId } = render(<ScrollableTabRail activeTab="first" />);
    const viewport = getByTestId('tab-viewport');
    setRailMeasurements(viewport, 'last', { left: 860, scrollWidth: 900 });

    rerender(<ScrollableTabRail activeTab="last" />);

    expect(viewport.scrollTo).toHaveBeenCalledWith({ left: 600, behavior: 'smooth' });
  });
});

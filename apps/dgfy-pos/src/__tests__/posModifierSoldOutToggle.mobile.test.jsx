// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosFnbModifierManager from '../../../../packages/web-core/src/features/pos/components/PosFnbModifierManager.jsx';

const originalMatchMedia = window.matchMedia;
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalVisualViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  window.requestAnimationFrame = originalRequestAnimationFrame;
  if (originalVisualViewportDescriptor) {
    Object.defineProperty(window, 'visualViewport', originalVisualViewportDescriptor);
  } else {
    delete window.visualViewport;
  }
  if (originalScrollIntoView) {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  } else {
    delete Element.prototype.scrollIntoView;
  }
});

describe('POS option-group editor interactions on mobile', () => {
  it('keeps the drawer anchored on toggle focus and confines field scrolling to the editor', () => {
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(max-width: 767px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    const scrollIntoView = vi.fn();
    const visualViewport = new EventTarget();
    let visualViewportHeight = window.innerHeight;
    let visualViewportOffsetTop = 0;
    Object.defineProperties(visualViewport, {
      height: { configurable: true, get: () => visualViewportHeight },
      offsetTop: { configurable: true, get: () => visualViewportOffsetTop }
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: visualViewport });
    Element.prototype.scrollIntoView = scrollIntoView;
    window.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };

    render(<PosFnbModifierManager groups={[]} items={[]} locations={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    const drawer = screen.getByRole('dialog').parentElement;
    const originalDrawerHeight = `${window.innerHeight - 8}px`;
    expect(drawer.style.height).toBe(originalDrawerHeight);

    const editorBody = screen.getByTestId('fnb-option-group-editor-scroll');
    editorBody.getBoundingClientRect = () => ({ top: 100, bottom: 280 });
    Object.defineProperty(editorBody, 'scrollTop', { configurable: true, writable: true, value: 0 });
    const choiceName = screen.getByRole('textbox', { name: 'Choice 1 name' });
    choiceName.getBoundingClientRect = () => ({
      top: 250 - editorBody.scrollTop,
      bottom: 290 - editorBody.scrollTop
    });
    fireEvent.focus(choiceName);

    expect(editorBody.scrollTop).toBe(10);
    expect(scrollIntoView).not.toHaveBeenCalled();

    const soldOut = screen.getByRole('checkbox', { name: 'Sold out' });
    expect(soldOut.className).toContain('absolute');
    expect(soldOut.className).toContain('h-4');
    expect(soldOut.className).toContain('w-7');
    expect(soldOut.className).not.toContain('sr-only');
    fireEvent.focus(soldOut);

    expect(scrollIntoView).not.toHaveBeenCalled();

    soldOut.focus();
    act(() => visualViewport.dispatchEvent(new Event('scroll')));

    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(soldOut);

    expect(soldOut.checked).toBe(true);
    expect(screen.getByRole('dialog')).toBeTruthy();

    visualViewportHeight = 360;
    act(() => visualViewport.dispatchEvent(new Event('resize')));
    act(() => window.dispatchEvent(new Event('resize')));

    expect(drawer.style.height).toBe(originalDrawerHeight);
    expect(drawer.style.maxHeight).toBe(originalDrawerHeight);

    visualViewportOffsetTop = 80;
    act(() => visualViewport.dispatchEvent(new Event('scroll')));

    expect(drawer.style.bottom).toBe('0px');
  });
});

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blurActiveTerminalEditor,
  restoreTerminalViewportAfterUnlock
} from '../utils/terminalViewportRecovery.js';

describe('terminal viewport recovery', () => {
  let originalVisualViewport;
  let workspaceElement;

  beforeEach(() => {
    vi.useFakeTimers();
    originalVisualViewport = window.visualViewport;
    workspaceElement = document.createElement('div');
    workspaceElement.scrollTo = vi.fn();
    window.scrollTo = vi.fn();
    window.requestAnimationFrame = vi.fn((callback) => window.setTimeout(callback, 0));
    window.cancelAnimationFrame = vi.fn((frameId) => window.clearTimeout(frameId));
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: new EventTarget()
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport
    });
  });

  it('blurs the focused login field before terminal unlock', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    expect(blurActiveTerminalEditor()).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it('restores document and workspace scrolling while the visual viewport settles', () => {
    document.documentElement.scrollTop = 180;
    document.body.scrollTop = 180;
    workspaceElement.scrollTop = 240;

    const stopRecovery = restoreTerminalViewportAfterUnlock({ workspaceElement });

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
    expect(workspaceElement.scrollTop).toBe(0);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });

    window.visualViewport.dispatchEvent(new Event('resize'));
    vi.runAllTimers();

    expect(window.scrollTo.mock.calls.length).toBeGreaterThan(2);
    expect(workspaceElement.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    stopRecovery();
  });
});

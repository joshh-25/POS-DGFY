import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SCROLL_LINE_STEP,
  handlePaneScrollKeyDown,
} from '../scrollKeyControls.js';

const createEvent = (key, { sameTarget = true, clientHeight = 400, scrollHeight = 1200 } = {}) => {
  const node = {
    clientHeight,
    scrollHeight,
    scrollBy: vi.fn(),
    scrollTo: vi.fn(),
  };
  const event = {
    key,
    currentTarget: node,
    target: sameTarget ? node : {},
    preventDefault: vi.fn(),
  };
  return { event, node };
};

describe('scrollKeyControls', () => {
  it('ignores key events that do not originate from the pane node', () => {
    const { event, node } = createEvent('ArrowDown', { sameTarget: false });
    const handled = handlePaneScrollKeyDown(event);
    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(node.scrollBy).not.toHaveBeenCalled();
  });

  it('handles ArrowDown and ArrowUp with fixed line-step deltas', () => {
    const down = createEvent('ArrowDown');
    expect(handlePaneScrollKeyDown(down.event)).toBe(true);
    expect(down.event.preventDefault).toHaveBeenCalledTimes(1);
    expect(down.node.scrollBy).toHaveBeenCalledWith({ top: DEFAULT_SCROLL_LINE_STEP, behavior: 'auto' });

    const up = createEvent('ArrowUp');
    expect(handlePaneScrollKeyDown(up.event)).toBe(true);
    expect(up.event.preventDefault).toHaveBeenCalledTimes(1);
    expect(up.node.scrollBy).toHaveBeenCalledWith({ top: -DEFAULT_SCROLL_LINE_STEP, behavior: 'auto' });
  });

  it('handles page keys using 80% viewport fallback with min threshold', () => {
    const large = createEvent('PageDown', { clientHeight: 500 });
    expect(handlePaneScrollKeyDown(large.event)).toBe(true);
    expect(large.node.scrollBy).toHaveBeenCalledWith({ top: 400, behavior: 'auto' });

    const small = createEvent('PageUp', { clientHeight: 100 });
    expect(handlePaneScrollKeyDown(small.event)).toBe(true);
    expect(small.node.scrollBy).toHaveBeenCalledWith({ top: -120, behavior: 'auto' });
  });

  it('handles Home and End by jumping to pane boundaries', () => {
    const home = createEvent('Home');
    expect(handlePaneScrollKeyDown(home.event)).toBe(true);
    expect(home.node.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });

    const end = createEvent('End', { scrollHeight: 1337 });
    expect(handlePaneScrollKeyDown(end.event)).toBe(true);
    expect(end.node.scrollTo).toHaveBeenCalledWith({ top: 1337, behavior: 'auto' });
  });

  it('returns false for unsupported keys', () => {
    const { event, node } = createEvent('Tab');
    const handled = handlePaneScrollKeyDown(event);
    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(node.scrollBy).not.toHaveBeenCalled();
    expect(node.scrollTo).not.toHaveBeenCalled();
  });
});

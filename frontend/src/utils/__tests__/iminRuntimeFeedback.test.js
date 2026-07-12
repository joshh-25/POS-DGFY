import { describe, expect, it } from 'vitest';
import { emitIminPosFeedback, isIminWrapperRuntime } from '../iminRuntimeFeedback.js';

const createIminWindow = () => {
  const events = [];
  return {
    iMinBridge: { isIminWrapper: () => true },
    dispatchEvent: (event) => events.push(event),
    events
  };
};

describe('iMin POS feedback runtime', () => {
  it('detects only the trusted iMin WebView bridge', () => {
    expect(isIminWrapperRuntime(createIminWindow())).toBe(true);
    expect(isIminWrapperRuntime({ iMinBridge: {} })).toBe(false);
    expect(isIminWrapperRuntime(null)).toBe(false);
  });

  it('dispatches APK feedback as an inline terminal event instead of a native alert', () => {
    const previousCustomEvent = globalThis.CustomEvent;
    globalThis.CustomEvent = class {
      constructor(type, init) {
        this.type = type;
        this.detail = init.detail;
      }
    };
    const windowObj = createIminWindow();

    try {
      emitIminPosFeedback({ tone: 'error', message: 'Opening cash amount is required.' }, windowObj);
      expect(windowObj.events).toHaveLength(1);
      expect(windowObj.events[0]).toMatchObject({
        type: 'dgfy:imin-pos-feedback',
        detail: {
          tone: 'error',
          message: 'Opening cash amount is required.'
        }
      });
    } finally {
      globalThis.CustomEvent = previousCustomEvent;
    }
  });
});

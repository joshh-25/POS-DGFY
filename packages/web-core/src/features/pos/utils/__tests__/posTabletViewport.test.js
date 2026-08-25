import { describe, expect, it } from 'vitest';
import {
  IMIN_TABLET_MAX_WIDTH_PX,
  POS_TABLET_MAX_WIDTH_PX,
  POS_TABLET_MIN_WIDTH_PX,
  isPosTabletViewport
} from '../posTabletViewport.js';

const createWindow = ({ isImin = false, throws = false } = {}) => ({
  iMinBridge: {
    isIminWrapper: () => {
      if (throws) throw new Error('bridge unavailable');
      return isImin;
    }
  }
});

describe('POS tablet viewport classification', () => {
  it.each([800, 1024, 1279])('uses tablet layout at %ipx on every POS surface', (viewportWidth) => {
    expect(isPosTabletViewport({ viewportWidth, isDgfyPosSurface: true })).toBe(true);
    expect(isPosTabletViewport({ viewportWidth, isDgfyPosSurface: false })).toBe(true);
  });

  it('uses tablet layout for the iMin Falcon 1 native 1280px landscape width', () => {
    expect(isPosTabletViewport({
      viewportWidth: 1280,
      isDgfyPosSurface: true,
      windowObj: createWindow({ isImin: true })
    })).toBe(true);
  });

  it('keeps an ordinary 1280px browser on the desktop layout', () => {
    expect(isPosTabletViewport({
      viewportWidth: 1280,
      isDgfyPosSurface: true,
      windowObj: createWindow()
    })).toBe(false);
  });

  it.each([640, 767, 1281, 1440])('does not classify %ipx as tablet', (viewportWidth) => {
    expect(isPosTabletViewport({
      viewportWidth,
      isDgfyPosSurface: true,
      windowObj: createWindow({ isImin: true })
    })).toBe(false);
  });

  it('fails safely when the native bridge probe throws', () => {
    expect(isPosTabletViewport({
      viewportWidth: 1280,
      isDgfyPosSurface: true,
      windowObj: createWindow({ throws: true })
    })).toBe(false);
  });

  it('publishes the supported width boundaries', () => {
    expect(POS_TABLET_MIN_WIDTH_PX).toBe(768);
    expect(POS_TABLET_MAX_WIDTH_PX).toBe(1279);
    expect(IMIN_TABLET_MAX_WIDTH_PX).toBe(1280);
  });
});

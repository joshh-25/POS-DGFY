import { describe, expect, it } from 'vitest';
import {
  IMIN_TABLET_MAX_WIDTH_PX,
  POS_MOBILE_LANDSCAPE_MAX_HEIGHT_PX,
  POS_MOBILE_MAX_WIDTH_PX,
  POS_TABLET_LANDSCAPE_MIN_WIDTH_PX,
  POS_TABLET_MAX_WIDTH_PX,
  POS_TABLET_MIN_WIDTH_PX,
  isPosTabletLandscapeViewport,
  isPosMobileLandscapeViewport,
  isPosMobileViewport,
  isPosTabletPortraitViewport,
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

const createTouchLandscapeWindow = () => ({
  innerHeight: 390,
  navigator: { maxTouchPoints: 5 },
  matchMedia: () => ({ matches: true })
});

describe('POS tablet viewport classification', () => {
  it.each([800, 1024, 1279])('uses tablet layout at %ipx on every POS surface', (viewportWidth) => {
    expect(isPosTabletViewport({ viewportWidth, isDgfyPosSurface: true })).toBe(true);
    expect(isPosTabletViewport({ viewportWidth, isDgfyPosSurface: false })).toBe(true);
  });

  it('identifies landscape tablet widths without changing the shared tablet classifier', () => {
    expect(isPosTabletLandscapeViewport({ viewportWidth: 1024 })).toBe(true);
    expect(isPosTabletLandscapeViewport({ viewportWidth: 1279 })).toBe(true);
    expect(isPosTabletLandscapeViewport({ viewportWidth: 800 })).toBe(false);
    expect(isPosTabletViewport({ viewportWidth: 800 })).toBe(true);
  });

  it('keeps a touch phone in the mobile flow when held in landscape', () => {
    const windowObj = createTouchLandscapeWindow();

    expect(isPosMobileLandscapeViewport({
      viewportWidth: 844,
      viewportHeight: 390,
      windowObj
    })).toBe(true);
    expect(isPosMobileViewport({
      viewportWidth: 844,
      viewportHeight: 390,
      windowObj
    })).toBe(true);
    expect(isPosTabletViewport({
      viewportWidth: 844,
      viewportHeight: 390,
      isDgfyPosSurface: true,
      windowObj
    })).toBe(false);
  });

  it('does not treat a short desktop window as a mobile phone without touch input', () => {
    const windowObj = {
      innerHeight: 390,
      navigator: { maxTouchPoints: 0 },
      matchMedia: () => ({ matches: false })
    };

    expect(isPosMobileLandscapeViewport({
      viewportWidth: 844,
      viewportHeight: 390,
      windowObj
    })).toBe(false);
    expect(isPosTabletViewport({
      viewportWidth: 844,
      viewportHeight: 390,
      isDgfyPosSurface: true,
      windowObj
    })).toBe(true);
  });

  it('identifies portrait tablet widths below the landscape threshold', () => {
    expect(isPosTabletPortraitViewport({ viewportWidth: 768 })).toBe(true);
    expect(isPosTabletPortraitViewport({ viewportWidth: 1023 })).toBe(true);
    expect(isPosTabletPortraitViewport({ viewportWidth: 1024 })).toBe(false);
    expect(isPosTabletPortraitViewport({ viewportWidth: 640 })).toBe(false);
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
    expect(POS_MOBILE_MAX_WIDTH_PX).toBe(639);
    expect(POS_MOBILE_LANDSCAPE_MAX_HEIGHT_PX).toBe(500);
    expect(POS_TABLET_MIN_WIDTH_PX).toBe(768);
    expect(POS_TABLET_LANDSCAPE_MIN_WIDTH_PX).toBe(1024);
    expect(POS_TABLET_MAX_WIDTH_PX).toBe(1279);
    expect(IMIN_TABLET_MAX_WIDTH_PX).toBe(1280);
  });
});

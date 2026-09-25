import { isIminWrapperRuntime } from '@/src/utils/iminRuntimeFeedback.js';

export const POS_TABLET_MIN_WIDTH_PX = 768;
export const POS_TABLET_LANDSCAPE_MIN_WIDTH_PX = 1024;
export const POS_TABLET_MAX_WIDTH_PX = 1279;
export const IMIN_TABLET_MAX_WIDTH_PX = 1280;
export const POS_MOBILE_MAX_WIDTH_PX = 639;
export const POS_MOBILE_LANDSCAPE_MAX_HEIGHT_PX = 500;

const hasCoarseTouchInput = (windowObj) => {
  if (!windowObj) return false;

  const coarsePointer = typeof windowObj.matchMedia === 'function'
    && windowObj.matchMedia('(pointer: coarse)')?.matches === true;
  const touchPoints = Number(windowObj.navigator?.maxTouchPoints || 0);

  return coarsePointer || touchPoints > 0;
};

export const isPosMobileLandscapeViewport = ({
  viewportWidth,
  viewportHeight,
  windowObj = typeof window !== 'undefined' ? window : null
} = {}) => {
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);

  return Number.isFinite(width)
    && Number.isFinite(height)
    && width > height
    && height <= POS_MOBILE_LANDSCAPE_MAX_HEIGHT_PX
    && width < POS_TABLET_LANDSCAPE_MIN_WIDTH_PX
    && hasCoarseTouchInput(windowObj);
};

export const isPosMobileViewport = ({
  viewportWidth,
  viewportHeight,
  windowObj = typeof window !== 'undefined' ? window : null
} = {}) => {
  const width = Number(viewportWidth);

  return (Number.isFinite(width) && width <= POS_MOBILE_MAX_WIDTH_PX)
    || isPosMobileLandscapeViewport({ viewportWidth, viewportHeight, windowObj });
};

export const isPosTabletViewport = ({
  viewportWidth,
  viewportHeight,
  isDgfyPosSurface = false,
  windowObj = typeof window !== 'undefined' ? window : null
} = {}) => {
  const width = Number(viewportWidth);

  if (!Number.isFinite(width)) return false;
  if (isPosMobileLandscapeViewport({ viewportWidth, viewportHeight, windowObj })) return false;
  if (width >= POS_TABLET_MIN_WIDTH_PX && width <= POS_TABLET_MAX_WIDTH_PX) return true;

  return isDgfyPosSurface
    && width >= POS_TABLET_MIN_WIDTH_PX
    && width <= IMIN_TABLET_MAX_WIDTH_PX
    && isIminWrapperRuntime(windowObj);
};

export const isPosTabletLandscapeViewport = (options = {}) => {
  const width = Number(options.viewportWidth);

  return isPosTabletViewport(options)
    && width >= POS_TABLET_LANDSCAPE_MIN_WIDTH_PX;
};

export const isPosTabletPortraitViewport = (options = {}) => {
  const width = Number(options.viewportWidth);

  return isPosTabletViewport(options)
    && width < POS_TABLET_LANDSCAPE_MIN_WIDTH_PX;
};

export default isPosTabletViewport;

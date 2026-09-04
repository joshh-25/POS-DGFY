import { isIminWrapperRuntime } from '@/src/utils/iminRuntimeFeedback.js';

export const POS_TABLET_MIN_WIDTH_PX = 768;
export const POS_TABLET_MAX_WIDTH_PX = 1279;
export const IMIN_TABLET_MAX_WIDTH_PX = 1280;

/**
 * Keeps the shared POS tablet layout consistent across the terminal shell and
 * its workspaces. The Falcon 1's 1280px landscape display is tablet-sized for
 * cashier use, but a regular 1280px browser remains on the desktop layout.
 */
export const isPosTabletViewport = ({
  viewportWidth,
  isDgfyPosSurface = false,
  windowObj = typeof window !== 'undefined' ? window : null
} = {}) => {
  const width = Number(viewportWidth);
  if (!Number.isFinite(width)) return false;

  if (width >= POS_TABLET_MIN_WIDTH_PX && width <= POS_TABLET_MAX_WIDTH_PX) {
    return true;
  }

  return isDgfyPosSurface
    && width >= POS_TABLET_MIN_WIDTH_PX
    && width <= IMIN_TABLET_MAX_WIDTH_PX
    && isIminWrapperRuntime(windowObj);
};

export default isPosTabletViewport;

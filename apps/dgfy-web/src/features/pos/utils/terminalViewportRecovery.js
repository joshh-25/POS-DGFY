const TERMINAL_EDITOR_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const VIEWPORT_SETTLE_DELAYS_MS = [80, 240, 480];

const resetScrollableNode = (node) => {
  if (!node) return;

  node.scrollTop = 0;
  node.scrollLeft = 0;
  if (typeof node.scrollTo === 'function') {
    node.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }
};

export const blurActiveTerminalEditor = (documentRef = globalThis.document) => {
  const activeElement = documentRef?.activeElement;
  if (!activeElement?.matches?.(TERMINAL_EDITOR_SELECTOR)) return false;

  activeElement.blur?.();
  return true;
};

export const restoreTerminalViewportAfterUnlock = ({
  windowRef = globalThis.window,
  workspaceElement = null
} = {}) => {
  const documentRef = windowRef?.document;
  if (!windowRef || !documentRef) return () => {};

  blurActiveTerminalEditor(documentRef);

  let disposed = false;
  const animationFrameIds = [];
  const timeoutIds = [];
  const visualViewport = windowRef.visualViewport;

  const restoreScrollPosition = () => {
    if (disposed) return;

    resetScrollableNode(documentRef.documentElement);
    resetScrollableNode(documentRef.body);
    resetScrollableNode(workspaceElement);
    windowRef.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
  };

  const scheduleFrame = (callback) => {
    if (typeof windowRef.requestAnimationFrame !== 'function') {
      callback();
      return null;
    }

    const frameId = windowRef.requestAnimationFrame(callback);
    animationFrameIds.push(frameId);
    return frameId;
  };

  restoreScrollPosition();
  scheduleFrame(() => scheduleFrame(restoreScrollPosition));

  visualViewport?.addEventListener?.('resize', restoreScrollPosition, { passive: true });
  visualViewport?.addEventListener?.('scroll', restoreScrollPosition, { passive: true });
  visualViewport?.addEventListener?.('scrollend', restoreScrollPosition, { passive: true });

  VIEWPORT_SETTLE_DELAYS_MS.forEach((delay) => {
    timeoutIds.push(windowRef.setTimeout(restoreScrollPosition, delay));
  });

  return () => {
    disposed = true;
    animationFrameIds.forEach((frameId) => windowRef.cancelAnimationFrame?.(frameId));
    timeoutIds.forEach((timeoutId) => windowRef.clearTimeout?.(timeoutId));
    visualViewport?.removeEventListener?.('resize', restoreScrollPosition);
    visualViewport?.removeEventListener?.('scroll', restoreScrollPosition);
    visualViewport?.removeEventListener?.('scrollend', restoreScrollPosition);
  };
};

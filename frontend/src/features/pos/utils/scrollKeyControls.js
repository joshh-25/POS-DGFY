export const DEFAULT_SCROLL_LINE_STEP = 64;
export const DEFAULT_MIN_PAGE_STEP = 120;
export const DEFAULT_PAGE_STEP_RATIO = 0.8;

export const handlePaneScrollKeyDown = (
  event,
  {
    lineStep = DEFAULT_SCROLL_LINE_STEP,
    minPageStep = DEFAULT_MIN_PAGE_STEP,
    pageStepRatio = DEFAULT_PAGE_STEP_RATIO,
  } = {}
) => {
  if (!event || event.target !== event.currentTarget) return false;
  const node = event.currentTarget;
  const pageStep = Math.max(minPageStep, Math.round(Number(node?.clientHeight || 0) * pageStepRatio));

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    node.scrollBy({ top: lineStep, behavior: 'auto' });
    return true;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    node.scrollBy({ top: -lineStep, behavior: 'auto' });
    return true;
  }
  if (event.key === 'PageDown') {
    event.preventDefault();
    node.scrollBy({ top: pageStep, behavior: 'auto' });
    return true;
  }
  if (event.key === 'PageUp') {
    event.preventDefault();
    node.scrollBy({ top: -pageStep, behavior: 'auto' });
    return true;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    node.scrollTo({ top: 0, behavior: 'auto' });
    return true;
  }
  if (event.key === 'End') {
    event.preventDefault();
    node.scrollTo({ top: Number(node?.scrollHeight || 0), behavior: 'auto' });
    return true;
  }

  return false;
};

export const FNB_MOBILE_FLOATING_CART_TRAILING_GUTTER = 84;

export function buildFnbMobileLayout(isMobileViewport) {
  return {
    sectionTrailingInset: isMobileViewport ? FNB_MOBILE_FLOATING_CART_TRAILING_GUTTER : 0,
    catalogInlinePadding: isMobileViewport ? '0 16px' : '0 24px',
    menuInnerWidth: isMobileViewport ? 'calc(100% - 8px)' : '100%'
  };
}

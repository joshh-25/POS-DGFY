export const getPosTerminalLayoutClasses = ({ isTabletViewport = false } = {}) => ({
    shellClassName: 'h-full min-h-0 overflow-hidden',
    checkoutGridClassName: isTabletViewport
        ? 'grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden pb-20 md:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] md:pb-0 2xl:gap-4'
        : 'grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden pb-20 md:grid-cols-[minmax(0,1fr)_325px] md:pb-0 2xl:gap-6',
    catalogGridClassName: 'grid',
    catalogViewportClassName: 'flex min-h-0 flex-1 flex-col overflow-hidden',
    currentSaleBodyClassName: 'dgfy-pos-current-sale-panel-scroll grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_auto_auto] gap-2 overflow-hidden md:grid-rows-[auto_auto_auto] md:overflow-y-auto md:overscroll-contain md:pr-1 md:touch-pan-y',
    currentSaleItemsListClassName: 'dgfy-pos-scroll-region h-full min-h-0 overflow-y-auto overscroll-contain pr-1 touch-pan-y',
    checkoutPaneClassName: 'flex h-full min-h-0 max-h-full flex-col overflow-hidden',
    catalogPaneHeightClassName: 'h-full max-h-full',
    currentSalePaneHeightClassName: 'h-full max-h-full'
});

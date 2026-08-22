export const POS_LAYOUT_BREAKPOINTS = {
    tabletSmallestDimension: 600,
    tabletContentWidth: 768,
    largeTabletWidth: 1100
} as const;

export interface PosLayoutProfile {
    isTabletDevice: boolean;
    isTabletLayout: boolean;
    isCompactTablet: boolean;
    isLargeTablet: boolean;
    catalogColumns: 1 | 2 | 3;
}

export const resolvePosLayout = (width: number, height: number): PosLayoutProfile => {
    const safeWidth = Math.max(0, Number(width) || 0);
    const safeHeight = Math.max(0, Number(height) || 0);
    const smallestDimension = Math.min(safeWidth, safeHeight);
    const isTabletDevice = smallestDimension >= POS_LAYOUT_BREAKPOINTS.tabletSmallestDimension;
    const isTabletLayout = isTabletDevice && safeWidth >= POS_LAYOUT_BREAKPOINTS.tabletContentWidth;
    const isLargeTablet = isTabletLayout && safeWidth >= POS_LAYOUT_BREAKPOINTS.largeTabletWidth;

    return {
        isTabletDevice,
        isTabletLayout,
        isCompactTablet: isTabletDevice && !isLargeTablet,
        isLargeTablet,
        catalogColumns: isLargeTablet ? 3 : isTabletDevice ? 2 : 1
    };
};

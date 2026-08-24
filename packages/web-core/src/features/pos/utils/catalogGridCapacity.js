const toPositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const calculateCatalogGridCapacity = ({
    width,
    height,
    minimumCardWidth,
    cardHeight,
    gap
}) => {
    const safeWidth = toPositiveNumber(width, 1);
    const safeHeight = toPositiveNumber(height, 1);
    const safeMinimumCardWidth = toPositiveNumber(minimumCardWidth, safeWidth);
    const safeCardHeight = toPositiveNumber(cardHeight, safeHeight);
    const safeGap = Math.max(0, Number(gap) || 0);
    const columns = Math.max(1, Math.floor((safeWidth + safeGap) / (safeMinimumCardWidth + safeGap)));
    const rows = Math.max(1, Math.floor((safeHeight + safeGap) / (safeCardHeight + safeGap)));

    return {
        columns,
        rows,
        pageSize: columns * rows
    };
};

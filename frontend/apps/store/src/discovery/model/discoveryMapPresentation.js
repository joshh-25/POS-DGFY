export const getDiscoveryPinScaleForZoom = (zoom) => {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return 1;
  if (value <= 9.5) return 0.68;
  if (value <= 11) return 0.78;
  if (value <= 12.5) return 0.9;
  return 1;
};

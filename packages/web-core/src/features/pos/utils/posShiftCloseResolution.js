export const loadShiftCloseResolution = async ({
  shiftId,
  offlineScope,
  isOnline,
  locationId,
  listQueueEntries,
  fetchParkedSales
}) => {
  const normalizedShiftId = Number.parseInt(shiftId, 10);
  if (!Number.isInteger(normalizedShiftId) || normalizedShiftId <= 0) {
    return { activeParkedSaleCount: 0, pendingParkedSaleCount: 0 };
  }

  const localEntries = await listQueueEntries({ includeResolved: false, scope: offlineScope });
  const pendingParkedSaleCount = localEntries.filter((entry) => (
    String(entry?.operation || '').trim() === 'parked_sale'
    && Number.parseInt(entry?.shift_id || entry?.payload?.shift_id, 10) === normalizedShiftId
  )).length;

  if (!isOnline) return { activeParkedSaleCount: 0, pendingParkedSaleCount };

  const result = await fetchParkedSales({
    shift_id: normalizedShiftId,
    location_id: Number(locationId || 0) || undefined,
    limit: 100
  });
  const activeParkedSaleCount = Array.isArray(result?.parked_sales)
    ? result.parked_sales.filter((sale) => (
        ['parked', 'claimed'].includes(String(sale?.status || '').toLowerCase())
      )).length
    : 0;
  return { activeParkedSaleCount, pendingParkedSaleCount };
};

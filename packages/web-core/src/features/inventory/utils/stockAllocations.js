export const buildStockAllocationDraft = (locations = []) => (
  Object.fromEntries(
    (Array.isArray(locations) ? locations : [])
      .filter((location) => Number.isInteger(Number(location?.location_id)) && Number(location.location_id) > 0)
      .map((location) => [String(location.location_id), ''])
  )
);

export const buildStockAllocations = (draft = {}, locations = []) => (
  (Array.isArray(locations) ? locations : [])
    .map((location) => {
      const locationId = Number(location?.location_id);
      const quantity = Number(draft?.[String(locationId)]);
      return { location_id: locationId, quantity };
    })
    .filter((row) => (
      Number.isInteger(row.location_id)
      && row.location_id > 0
      && Number.isFinite(row.quantity)
      && row.quantity > 0
    ))
);

export const getStockAllocationTotal = (allocations = []) => (
  (Array.isArray(allocations) ? allocations : [])
    .reduce((total, row) => total + (Number(row?.quantity) || 0), 0)
);

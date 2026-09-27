export const formatParkedSaleDisplayName = (parkedSale = {}) => {
  const parkedSaleName = String(parkedSale?.snapshot?.parked_sale_name || '').trim();
  return parkedSaleName || 'Parked Sale';
};

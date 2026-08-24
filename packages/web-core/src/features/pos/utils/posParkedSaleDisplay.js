export const formatParkedSaleDisplayName = (parkedSale = {}) => {
  const parkedSaleId = Number.parseInt(parkedSale?.pos_parked_sale_id, 10);
  const parkedSaleName = String(parkedSale?.snapshot?.parked_sale_name || '').trim();
  const reference = Number.isInteger(parkedSaleId) && parkedSaleId > 0
    ? `Parked Sale #${parkedSaleId}`
    : 'Parked Sale';
  return parkedSaleName ? `${parkedSaleName} · ${reference}` : reference;
};

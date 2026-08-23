export const formatKitchenQuantity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '1';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
};

export const getKitchenLineName = (line, fallbackIndex = 0, itemMap = null) => {
  const mappedItem = itemMap?.get?.(Number(line?.item_id));
  return line?.item?.name || mappedItem?.name || `Item #${line?.item_id || fallbackIndex + 1}`;
};

export const getTicketSnapshotLines = (ticket, check) => {
  const snapshot = ticket?.lines_snapshot;
  if (Array.isArray(snapshot)) return snapshot;
  if (Array.isArray(snapshot?.lines)) return snapshot.lines;
  return Array.isArray(check?.lines) ? check.lines : [];
};

export const getTicketRecipeMovementCount = (ticket) => (
  Array.isArray(ticket?.lines_snapshot?.recipe_movements) ? ticket.lines_snapshot.recipe_movements.length : 0
);

export const getTicketSourceLabel = (ticket, check) => {
  const source = ticket?.lines_snapshot?.source;
  if (source === 'storefront_checkout') return 'Online';
  if (source === 'pos_checkout') return 'POS';
  return check?.order_method ? String(check.order_method).replace(/_/g, ' ') : 'F&B';
};

export const buildKitchenTicketDisplay = ({ ticket, check, itemMap = null }) => {
  const lines = getTicketSnapshotLines(ticket, check);
  return {
    ticket_number: ticket?.ticket_number || '',
    status: ticket?.status || '',
    source_label: getTicketSourceLabel(ticket, check),
    station_label: ticket?.station?.name || 'Unassigned station',
    check_id: check?.check_id || ticket?.check_id || null,
    recipe_movement_count: getTicketRecipeMovementCount(ticket),
    lines: lines.map((line, index) => ({
      check_line_id: line?.check_line_id || null,
      item_id: line?.item_id || null,
      name: getKitchenLineName(line, index, itemMap),
      quantity_label: formatKitchenQuantity(line?.quantity),
      status: line?.status || null
    }))
  };
};

const normalizeNote = (value) => String(value || '').trim();

/**
 * Keeps the global kitchen note independent from the table label.
 *
 * The table is persisted and printed through the F&B table fields. It must
 * never be folded into the order note because an empty note should not create
 * a synthetic note such as "Table 4".
 */
export const buildFnbGlobalOrderNote = ({ kitchenNotes = '' } = {}) => normalizeNote(kitchenNotes);

/**
 * Adds the manually entered table label to the print context without mixing it
 * into the separately persisted kitchen note.
 */
export const buildFnbPrintContext = ({ fnbContext = null, tableNumber = '', orderMethod = '' } = {}) => {
  const context = fnbContext && typeof fnbContext === 'object' ? { ...fnbContext } : {};
  const table = orderMethod === 'dine_in' ? normalizeNote(tableNumber) : '';
  if (table) {
    context.table_label = table;
    context.fnb_table_label_snapshot = table;
  }
  return Object.keys(context).length > 0 ? context : null;
};

export const normalizePosOrderNote = normalizeNote;

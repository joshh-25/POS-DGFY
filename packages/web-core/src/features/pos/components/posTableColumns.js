export const MAX_POS_TABLE_DATA_COLUMNS = 7;
export const MAX_POS_TABLE_TABLET_PORTRAIT_COLUMNS = 4;
export const MAX_POS_TABLE_TABLET_LANDSCAPE_COLUMNS = 6;
export const MAX_POS_TABLE_MOBILE_COLUMNS = 3;

const isDesktopVisible = (column) => column?.visibility?.desktop !== false;

const uniqueColumns = (columns) => {
  const seen = new Set();
  return columns.filter((column) => {
    if (!column?.key || seen.has(column.key)) return false;
    seen.add(column.key);
    return true;
  });
};

/**
 * Select the highest-priority data columns for the shared desktop table.
 *
 * Required fields always win, followed by fields explicitly marked as
 * default-visible, then unclassified fields. Explicitly hidden fields stay
 * out of the table and remain available to the details dialog.
 */
export const selectPosTableColumns = (columns = [], maxColumns = MAX_POS_TABLE_DATA_COLUMNS) => {
  const normalizedMax = Number.isInteger(Number(maxColumns)) && Number(maxColumns) > 0
    ? Number(maxColumns)
    : MAX_POS_TABLE_DATA_COLUMNS;
  const eligibleColumns = uniqueColumns(Array.isArray(columns) ? columns : []).filter(isDesktopVisible);
  const priorityGroups = [
    eligibleColumns.filter((column) => column.required === true),
    eligibleColumns.filter((column) => column.required !== true && column.defaultVisible === true),
    eligibleColumns.filter((column) => column.required !== true && column.defaultVisible == null)
  ];

  const selectedKeys = new Set(priorityGroups.flat().slice(0, normalizedMax).map((column) => column.key));

  // Select by priority, but render in the source-defined order so removing
  // lower-priority fields does not unexpectedly reshuffle the remaining table.
  return eligibleColumns.filter((column) => selectedKeys.has(column.key));
};

/**
 * Select the highest-priority report columns for a tablet table layout.
 * Explicitly hidden fields remain available through the row details action.
 */
export const selectPosTableColumnsForViewport = (columns = [], maxColumns, viewport) => {
  const normalizedMax = Number.isInteger(Number(maxColumns)) && Number(maxColumns) > 0
    ? Number(maxColumns)
    : MAX_POS_TABLE_DATA_COLUMNS;
  const eligibleColumns = uniqueColumns(Array.isArray(columns) ? columns : []).filter((column) => (
    isDesktopVisible(column)
    && column?.visibility?.[viewport] !== false
  ));
  const priorityGroups = [
    eligibleColumns.filter((column) => column.required === true),
    eligibleColumns.filter((column) => column.required !== true && column.defaultVisible === true),
    eligibleColumns.filter((column) => column.required !== true && column.defaultVisible == null)
  ];
  const selectedKeys = new Set(priorityGroups.flat().slice(0, normalizedMax).map((column) => column.key));

  return eligibleColumns.filter((column) => selectedKeys.has(column.key));
};

/**
 * Select the fields intended for compact mobile report cards. Explicitly
 * hidden/default-detail fields stay available from the row details action.
 */
export const selectPosTableMobileColumns = (
  columns = [],
  maxColumns = MAX_POS_TABLE_MOBILE_COLUMNS
) => {
  const normalizedMax = Number.isInteger(Number(maxColumns)) && Number(maxColumns) > 0
    ? Number(maxColumns)
    : MAX_POS_TABLE_MOBILE_COLUMNS;
  const eligibleColumns = uniqueColumns(Array.isArray(columns) ? columns : []).filter((column) => (
    column.visibility?.mobile !== false
    && (column.required === true || column.defaultVisible !== false)
  ));

  // Keep source order so the first field stays the card title; limit the rest
  // to the compact mobile set and leave the complete row in its details view.
  return eligibleColumns.slice(0, normalizedMax);
};

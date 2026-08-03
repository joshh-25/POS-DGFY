/**
 * Canonicalisation for menu-import category names.
 *
 * Shared by services/menuExtractionService.js (which stamps the extracted
 * section onto each row) and services/menuImportCategoryService.js (which
 * matches those names against existing ItemFolders). Both must agree, or a
 * category the extractor produced would fail to match the folder it created on
 * a previous import — the user would see duplicate-looking categories.
 *
 * 100 chars is not arbitrary: it is the column width of BOTH `item_folders.name`
 * and `items.product_folder` (STRING(100)).
 */
export const MENU_CATEGORY_NAME_MAX_LENGTH = 100;

/**
 * Trims, collapses internal whitespace runs, and truncates to the column width.
 * Returns null for anything that isn't a non-empty string, so callers can treat
 * "no category" uniformly.
 * @param {*} value
 * @returns {string|null}
 */
export const normalizeCategoryName = (value) => {
    if (typeof value !== 'string') return null;
    const collapsed = value.replace(/\s+/g, ' ').trim();
    return collapsed ? collapsed.slice(0, MENU_CATEGORY_NAME_MAX_LENGTH).trim() || null : null;
};

/**
 * Case-insensitive matching key. Separate from normalizeCategoryName so the
 * stored/displayed value keeps the menu's own casing ("Add-Ons", not "add-ons")
 * while "MAINS" and "Mains" still resolve to one category.
 * @param {*} value
 * @returns {string}
 */
export const categoryMatchKey = (value) => (normalizeCategoryName(value) || '').toLowerCase();

export default { MENU_CATEGORY_NAME_MAX_LENGTH, normalizeCategoryName, categoryMatchKey };

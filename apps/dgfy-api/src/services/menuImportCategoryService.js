/**
 * Menu Import Category Service
 *
 * Turns the menu categories the extractor found (carried on each preview row as
 * `product_folder`) into real, POS-usable categories before the rows are handed
 * to csvImportService.confirmImport.
 *
 * Why this exists: `items.category` is a fixed inventory ENUM
 * (raw_material|packaging|product|supplies|service) and can never hold "Mains".
 * The customer-facing category is an ItemFolder, linked through `items.folder_id`
 * — and POS catalog filtering keys off `folder_id`, NOT the `product_folder`
 * string (modules/pos/repositories/posRepository.js). The CSV import pipeline
 * only ever writes `product_folder` as free text, so before this, menu-imported
 * items displayed their category in reports but were not selectable under it in
 * the POS. This closes that gap.
 *
 * Permission model: creating a category normally requires `categories:manage`
 * (tenant admin), while the menu-import confirm route only requires
 * `items:import`. Rather than widening what `items:import` grants, an importer
 * without `categories:manage` gets link-to-existing-only: unmatched categories
 * are left as `product_folder` text with a NULL folder_id and reported back in
 * `skipped`, so the UI can tell them an admin needs to create those. Nothing is
 * silently dropped and the import is never blocked.
 */

import dbStore from '../utils/dbStore.js';
import logger from '../config/logger.js';
import { normalizeCategoryName, categoryMatchKey } from '../utils/menuCategoryName.js';

const activeFolderWhere = (where = {}) => ({
    ...where,
    is_active: true,
    deleted_at: null
});

/**
 * Distinct category names across the rows about to be confirmed, in first-seen
 * order so any folders we create follow the menu's own ordering.
 * @param {Array<Object>} rows - preview rows ({ data: { product_folder, ... } })
 * @returns {Array<string>} canonical names
 */
const collectCategoryNames = (rows) => {
    const seen = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const name = normalizeCategoryName(row?.data?.product_folder);
        if (!name) continue;
        const key = categoryMatchKey(name);
        if (!seen.has(key)) seen.set(key, name);
    }
    return [...seen.values()];
};

/**
 * Resolves the menu categories on a set of preview rows to ItemFolders and
 * stamps `folder_id` + the canonical `product_folder` onto each row in place.
 *
 * Both fields are already accepted by createItemSchema/updateItemSchema
 * (validators/itemValidator.js), so they survive confirmImport's Joi
 * `stripUnknown` re-validation and reach Item.bulkCreate.
 *
 * Never throws for category reasons — a category that cannot be created is
 * reported, not fatal. A genuine DB failure still propagates.
 *
 * @param {Object} params
 * @param {Array<Object>} params.rows - preview rows, mutated in place
 * @param {boolean} params.canManageCategories - does the importer hold categories:manage
 * @returns {Promise<{created: string[], linked: string[], skipped: string[]}>}
 */
export const resolveMenuImportCategories = async ({ rows, canManageCategories = false } = {}) => {
    const summary = { created: [], linked: [], skipped: [] };
    const names = collectCategoryNames(rows);
    if (names.length === 0) return summary;

    const ItemFolder = dbStore.get('ItemFolder');

    const existingFolders = await ItemFolder.findAll({
        where: activeFolderWhere({ parent_id: null }),
        attributes: ['folder_id', 'name']
    });

    // Match key -> folder. Mirrors the case-insensitive, whitespace-collapsed
    // comparison modules/inventory/repositories/itemRepository.js uses for
    // create_category_name, so a category created through the item form and one
    // created through a menu import resolve to the same folder.
    const foldersByKey = new Map();
    for (const folder of existingFolders) {
        foldersByKey.set(categoryMatchKey(folder.name), folder);
    }

    for (const name of names) {
        const key = categoryMatchKey(name);
        if (foldersByKey.has(key)) {
            summary.linked.push(foldersByKey.get(key).name);
            continue;
        }

        if (!canManageCategories) {
            summary.skipped.push(name);
            continue;
        }

        try {
            const folder = await ItemFolder.create({
                name,
                description: '',
                show_in_pos_filter: true,
                is_active: true,
                parent_id: null
            });
            foldersByKey.set(key, folder);
            summary.created.push(folder.name);
        } catch (error) {
            // A concurrent import (or the unique active-name index added by
            // migration 20260714000001) can win the race. Re-select rather than
            // failing the whole confirm — same recovery itemRepository.js uses.
            if (error?.name !== 'SequelizeUniqueConstraintError') throw error;

            const folder = await ItemFolder.findOne({ where: activeFolderWhere({ parent_id: null, name }) });
            if (!folder) {
                logger.warn(`[MenuImportCategories] Could not create or re-select category "${name}"`);
                summary.skipped.push(name);
                continue;
            }
            foldersByKey.set(key, folder);
            summary.linked.push(folder.name);
        }
    }

    // Stamp the resolved folder onto every row. product_folder is rewritten to
    // the folder's canonical casing so the legacy string mirrors the folder name
    // exactly — the same "sync both" invariant services/itemGroupingService.js
    // maintains when assigning items to a folder.
    for (const row of Array.isArray(rows) ? rows : []) {
        const name = normalizeCategoryName(row?.data?.product_folder);
        if (!name || !row?.data) continue;
        const folder = foldersByKey.get(categoryMatchKey(name));
        if (folder) {
            row.data.folder_id = folder.folder_id;
            row.data.product_folder = folder.name;
        } else {
            // Unresolved: keep the text so the category is still visible in
            // reports and re-linkable later, but do not fabricate a folder_id.
            row.data.product_folder = name;
        }
    }

    return summary;
};

export default { resolveMenuImportCategories };

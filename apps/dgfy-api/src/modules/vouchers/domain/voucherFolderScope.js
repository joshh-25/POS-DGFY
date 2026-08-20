// Pure voucher scope resolution. Zero DB imports, same discipline as
// `voucherEligibilityPolicy.js` / `voucherBenefitPolicy.js` -- the folder-adjacency and
// item-to-folder reads live in `voucherRepository.js` and are fed into this module as plain data.
//
// ADR 0066 decision 11 `[default]`: folder scope includes descendants, resolved at redemption time
// and snapshotted into `voucher_redemption_lines`. This module is that resolution step: given the
// tenant's full folder tree (flat `{folder_id, parent_id}` rows) and a set of directly-scoped
// folder ids, it returns every descendant folder id via BFS, then unions that with any directly
// scoped `item` entries to produce the concrete eligible item-id set.
//
// `Item.folder_id` (see `src/models/Item.js`) is the FK this module resolves against -- confirmed
// by reading the model rather than assumed.

/**
 * Resolve every descendant of a set of root folder ids, BFS over a flat `parent_id` adjacency list.
 *
 * Cycle-safe: a folder is only ever enqueued once (`visited`), so a malformed tree with a cycle
 * (should never happen via normal CRUD, but this module must not trust that) cannot hang the loop.
 *
 * @param {{rootFolderIds: Array<number>, folders: Array<{folder_id: number, parent_id: number|null}>}} args
 * @returns {Set<number>} the root ids themselves plus every descendant, deduplicated.
 */
export const resolveDescendantFolderIds = ({ rootFolderIds = [], folders = [] } = {}) => {
    const childrenByParent = new Map();
    (Array.isArray(folders) ? folders : []).forEach((folder) => {
        if (folder?.parent_id == null) return;
        const parentId = Number(folder.parent_id);
        const folderId = Number(folder?.folder_id);
        if (!Number.isInteger(parentId) || !Number.isInteger(folderId)) return;
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(folderId);
    });

    const roots = [...new Set(
        (Array.isArray(rootFolderIds) ? rootFolderIds : [])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
    )];

    const result = new Set(roots);
    const visited = new Set(roots);
    const queue = [...roots];

    while (queue.length > 0) {
        const current = queue.shift();
        const children = childrenByParent.get(current) || [];
        for (const childId of children) {
            if (visited.has(childId)) continue; // cycle guard
            visited.add(childId);
            result.add(childId);
            queue.push(childId);
        }
    }

    return result;
};

/**
 * Resolve a voucher's `voucher_scopes` rows to the concrete set of eligible `item_id`s.
 *
 * `scopes.length === 0` is deliberately NOT "zero eligible items" -- it means the voucher carries
 * no scope at all, which `voucherBenefitPolicy.js`'s own convention treats as whole-order eligible
 * (`eligible !== false` on a line with no scoping caller). That is signaled here by returning
 * `itemIds: null` (unscoped) rather than an empty Set, so a caller can tell "everything is
 * eligible" apart from "the scope resolved to nothing" -- the latter is what ADR 0066 decision 3
 * requires failing closed on, the former must not.
 *
 * @param {{
 *   scopes: Array<{scope_type: 'item'|'item_folder', scope_ref_id: number}>,
 *   folders: Array<{folder_id: number, parent_id: number|null}>,
 *   items: Array<{item_id: number, folder_id: number|null}>
 * }} args
 * @returns {{scoped: boolean, itemIds: Set<number>|null, descendantFolderIds: Set<number>}}
 */
export const resolveVoucherScopeItemIds = ({ scopes = [], folders = [], items = [] } = {}) => {
    const scopeList = Array.isArray(scopes) ? scopes : [];
    if (scopeList.length === 0) {
        return { scoped: false, itemIds: null, descendantFolderIds: new Set() };
    }

    const directItemIds = new Set();
    const rootFolderIds = [];
    scopeList.forEach((scope) => {
        if (scope?.scope_type === 'item') {
            const id = Number(scope.scope_ref_id);
            if (Number.isInteger(id) && id > 0) directItemIds.add(id);
        } else if (scope?.scope_type === 'item_folder') {
            rootFolderIds.push(scope.scope_ref_id);
        }
    });

    const descendantFolderIds = resolveDescendantFolderIds({ rootFolderIds, folders });

    const itemIds = new Set(directItemIds);
    (Array.isArray(items) ? items : []).forEach((item) => {
        const folderId = item?.folder_id == null ? null : Number(item.folder_id);
        if (folderId != null && descendantFolderIds.has(folderId)) {
            const id = Number(item.item_id);
            if (Number.isInteger(id) && id > 0) itemIds.add(id);
        }
    });

    return { scoped: true, itemIds, descendantFolderIds };
};

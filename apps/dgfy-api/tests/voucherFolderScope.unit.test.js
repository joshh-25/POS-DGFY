// Unit tests for src/modules/vouchers/domain/voucherFolderScope.js (Phase 105, #455).
//
// Load-bearing cases: descendant resolution over a multi-level tree, the cycle guard (a malformed
// tree must not hang the BFS), and the "unscoped vs. scope-resolves-to-nothing" distinction that
// `resolveVoucherScopeItemIds` exists to make -- ADR 0066 decision 3 fails closed on the latter,
// never the former.

import {
    resolveDescendantFolderIds,
    resolveVoucherScopeItemIds
} from '../src/modules/vouchers/domain/voucherFolderScope.js';

describe('resolveDescendantFolderIds', () => {
    it('includes the root folder itself plus every descendant', () => {
        const folders = [
            { folder_id: 1, parent_id: null },
            { folder_id: 2, parent_id: 1 },
            { folder_id: 3, parent_id: 1 },
            { folder_id: 4, parent_id: 2 },
            { folder_id: 5, parent_id: 99 } // unrelated branch, must not be included
        ];
        const result = resolveDescendantFolderIds({ rootFolderIds: [1], folders });
        expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    });

    it('supports multiple root folders independently', () => {
        const folders = [
            { folder_id: 1, parent_id: null },
            { folder_id: 2, parent_id: 1 },
            { folder_id: 10, parent_id: null },
            { folder_id: 11, parent_id: 10 }
        ];
        const result = resolveDescendantFolderIds({ rootFolderIds: [1, 10], folders });
        expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 10, 11]);
    });

    it('does not hang on a cyclic folder tree', () => {
        const folders = [
            { folder_id: 1, parent_id: 2 },
            { folder_id: 2, parent_id: 1 }
        ];
        const result = resolveDescendantFolderIds({ rootFolderIds: [1], folders });
        expect([...result].sort((a, b) => a - b)).toEqual([1, 2]);
    });

    it('returns an empty set for no roots', () => {
        expect(resolveDescendantFolderIds({ rootFolderIds: [], folders: [] }).size).toBe(0);
    });

    it('ignores non-positive-integer root ids', () => {
        const result = resolveDescendantFolderIds({ rootFolderIds: [0, -1, 'abc', null], folders: [] });
        expect(result.size).toBe(0);
    });
});

describe('resolveVoucherScopeItemIds', () => {
    const folders = [
        { folder_id: 1, parent_id: null },
        { folder_id: 2, parent_id: 1 }
    ];
    const items = [
        { item_id: 100, folder_id: 1 },
        { item_id: 101, folder_id: 2 },
        { item_id: 102, folder_id: null },
        { item_id: 103, folder_id: 99 } // not under any scoped folder
    ];

    it('returns scoped:false and itemIds:null when there is no scope at all (whole-order eligible)', () => {
        const result = resolveVoucherScopeItemIds({ scopes: [], folders, items });
        expect(result.scoped).toBe(false);
        expect(result.itemIds).toBeNull();
    });

    it('resolves a folder scope to every item under that folder and its descendants', () => {
        const result = resolveVoucherScopeItemIds({
            scopes: [{ scope_type: 'item_folder', scope_ref_id: 1 }],
            folders,
            items
        });
        expect(result.scoped).toBe(true);
        expect([...result.itemIds].sort((a, b) => a - b)).toEqual([100, 101]);
    });

    it('unions direct item scopes with folder-resolved items', () => {
        const result = resolveVoucherScopeItemIds({
            scopes: [
                { scope_type: 'item_folder', scope_ref_id: 2 },
                { scope_type: 'item', scope_ref_id: 103 }
            ],
            folders,
            items
        });
        expect(result.scoped).toBe(true);
        expect([...result.itemIds].sort((a, b) => a - b)).toEqual([101, 103]);
    });

    it('resolves to an empty Set (not null) when the scope matches nothing in the item catalog', () => {
        const result = resolveVoucherScopeItemIds({
            scopes: [{ scope_type: 'item_folder', scope_ref_id: 999 }],
            folders,
            items
        });
        expect(result.scoped).toBe(true);
        expect(result.itemIds.size).toBe(0);
    });
});

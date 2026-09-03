// Phase 257 (#1318). Characterization tests pinning ADR 0080 clause 1
// `[binding]`: resolveCategoryRateBps, resolveVoucherScopeItemIds, and
// resolveEffectiveFnbModifierGroups read `items.folder_id` (the primary
// category) and only the primary — a secondary membership must never change
// their output. These are the executable form of that clause, and the
// single highest-value tests in this phase (plan section 9).
//
// None of the three functions under test take an item_folder_memberships row
// as an argument at all, by construction. So "identical output with and
// without membership rows present" is characterized here as: attaching
// membership-shaped data to the SAME inputs these functions actually read
// (an item's secondary folder, or a second folder's own money-adjacent
// config) must not change the result for the item's PRIMARY folder.

import { describe, expect, it } from '@jest/globals';
import { resolveCategoryRateBps } from '../src/modules/dgfy/utils/affiliateCommissionAccrual.js';
import { resolveVoucherScopeItemIds } from '../src/modules/vouchers/domain/voucherFolderScope.js';
import { resolveEffectiveFnbModifierGroups } from '../src/modules/shared/utils/effectiveFnbModifierGroups.js';

describe('ADR 0080 clause 1 — primary-only invariant survives secondary category memberships', () => {
    it('resolveCategoryRateBps ignores a secondary folder\'s rate row entirely', () => {
        const PRIMARY_FOLDER_ID = 10;
        const SECONDARY_FOLDER_ID = 20; // e.g. an item_folder_memberships row for the same item
        const categoryRateRows = [
            { folder_id: PRIMARY_FOLDER_ID, enrollment_id: 0, rate_bps: 300, active: true },
            // A different, higher rate configured for a folder this item only belongs to as a
            // SECONDARY membership. If this ever leaks in, the merchant is overpaying commission
            // on every item that also happens to carry that secondary membership.
            { folder_id: SECONDARY_FOLDER_ID, enrollment_id: 0, rate_bps: 900, active: true }
        ];

        const rateWithoutMembership = resolveCategoryRateBps(
            categoryRateRows.filter((row) => row.folder_id === PRIMARY_FOLDER_ID),
            PRIMARY_FOLDER_ID
        );
        const rateWithMembershipRowsPresent = resolveCategoryRateBps(categoryRateRows, PRIMARY_FOLDER_ID);

        expect(rateWithoutMembership).toBe(300);
        expect(rateWithMembershipRowsPresent).toBe(300);
        expect(rateWithMembershipRowsPresent).toBe(rateWithoutMembership);
    });

    it('resolveVoucherScopeItemIds scopes strictly to the primary folder_id, never a secondary one', () => {
        const PRIMARY_FOLDER_ID = 1;
        const SECONDARY_FOLDER_ID = 2;
        const folders = [
            { folder_id: PRIMARY_FOLDER_ID, parent_id: null },
            { folder_id: SECONDARY_FOLDER_ID, parent_id: null }
        ];
        const scopes = [{ scope_type: 'item_folder', scope_ref_id: PRIMARY_FOLDER_ID }];

        // itemLegacy has no secondary memberships at all; itemWithMembership is the SAME item
        // (same primary folder_id) but the plan's read-site inventory (B26/B27) is fed a plain
        // {item_id, folder_id} row regardless of how many memberships exist elsewhere — this
        // asserts that shape is what the function actually consumes, and that it is blind to a
        // membership pointing this same item at the un-scoped SECONDARY_FOLDER_ID.
        const itemLegacy = { item_id: 501, folder_id: PRIMARY_FOLDER_ID };
        const itemWithMembershipElsewhere = { item_id: 501, folder_id: PRIMARY_FOLDER_ID };
        const itemOnlyInSecondary = { item_id: 502, folder_id: SECONDARY_FOLDER_ID };

        const legacyResult = resolveVoucherScopeItemIds({ scopes, folders, items: [itemLegacy] });
        const withMembershipResult = resolveVoucherScopeItemIds({
            scopes,
            folders,
            items: [itemWithMembershipElsewhere, itemOnlyInSecondary]
        });

        expect([...legacyResult.itemIds]).toEqual([501]);
        // Item 501 still resolves (via its unchanged primary folder_id); item 502 — scoped only via
        // a folder this test treats as a secondary-only membership target — must NOT resolve,
        // because voucher scope reads the primary only (ADR 0080 clause 1).
        expect([...withMembershipResult.itemIds]).toEqual([501]);
        expect(withMembershipResult.itemIds.has(502)).toBe(false);
    });

    it('resolveEffectiveFnbModifierGroups never inherits a secondary folder\'s modifier groups', () => {
        const primaryGroup = { modifier_group_id: 11, name: 'Primary Sizes', sort_order: 0 };
        const secondaryGroup = { modifier_group_id: 22, name: 'Secondary Add-ons', sort_order: 0 };

        const itemWithPrimaryOnly = {
            item_id: 900,
            folder_id: 10,
            folder: { folder_id: 10, fnbModifierGroups: [primaryGroup] }
        };

        // Same item, but shaped as if a `secondaryFolders` include (the new belongsToMany alias,
        // ADR 0080 §3) had been eagerly loaded and happened to carry its own inherited modifier
        // groups. resolveEffectiveFnbModifierGroups must never read that key — only `item.folder`.
        const itemWithSecondaryFolderLoaded = {
            ...itemWithPrimaryOnly,
            secondaryFolders: [{ folder_id: 20, fnbModifierGroups: [secondaryGroup] }]
        };

        const withoutMembership = resolveEffectiveFnbModifierGroups(itemWithPrimaryOnly);
        const withMembershipPresent = resolveEffectiveFnbModifierGroups(itemWithSecondaryFolderLoaded);

        const idsWithout = withoutMembership.map((group) => group.modifier_group_id);
        const idsWith = withMembershipPresent.map((group) => group.modifier_group_id);

        expect(idsWithout).toEqual([11]);
        expect(idsWith).toEqual([11]);
        expect(idsWith).toEqual(idsWithout);
    });
});

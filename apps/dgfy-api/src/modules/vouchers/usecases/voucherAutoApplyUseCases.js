// #1332 (Phase 244, epic #1321 decision 9): the thin impure shell around the pure auto-apply
// selector. One query, one pure call -- that is the whole impure surface of this phase's core logic,
// which is what makes the determinism claim in the Phase 244 plan auditable rather than aspirational.
//
// Deliberately NOT wrapped in `ok`/`fail` -- same convention as `voucherRedemptionUseCases.js`'s two
// use cases, which this mirrors: this is called from deep inside `storeUseCases.js`'s own checkout
// flow, not from an HTTP-boundary controller.

import { selectAutoAppliedDeliveryCampaign } from '../domain/autoAppliedCampaignPolicy.js';

/**
 * @param {{repository: Object}} deps
 * @returns {(args: {context: Object, transaction?: Object|null}) => Promise<ReturnType<typeof selectAutoAppliedDeliveryCampaign>>}
 */
export const buildResolveAutoAppliedDeliveryCampaignUseCase = ({ repository }) => async ({
    context = {},
    transaction = null
} = {}) => {
    const candidates = await repository.listAutoApplyDeliveryCampaigns({ transaction });

    // #788 (Phase 269): hydrate the account allowlist for whichever candidates declare themselves
    // account-restricted, in ONE batched query for the whole set -- never one per candidate, which
    // would reintroduce exactly the per-row I/O the "one query, one pure call" contract above
    // rules out. Candidates that are not restricted are left untouched and cost nothing.
    //
    // An account-restricted auto-apply campaign is unusual but legitimate (a free-delivery perk for
    // a handful of corporate accounts). Without this hydration the pure selector would fail closed
    // on VOUCHER_ACCOUNT_GRANTS_UNRESOLVED and silently reject every such campaign as NOT_ELIGIBLE
    // -- correct in direction, but a permanently broken product feature rather than an enforced one.
    const restrictedIds = candidates
        .filter((voucher) => voucher?.is_account_restricted === true || voucher?.is_account_restricted === 1)
        .map((voucher) => voucher.voucher_id);
    if (restrictedIds.length > 0) {
        const grantsByVoucherId = await repository.listAccountGrants(restrictedIds, { transaction });
        candidates.forEach((voucher) => {
            if (voucher?.is_account_restricted !== true && voucher?.is_account_restricted !== 1) return;
            voucher.account_grant_ids = grantsByVoucherId[voucher.voucher_id] || [];
        });
    }

    return selectAutoAppliedDeliveryCampaign({ candidates, context });
};

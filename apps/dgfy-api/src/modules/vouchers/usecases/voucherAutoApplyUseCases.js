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
    return selectAutoAppliedDeliveryCampaign({ candidates, context });
};

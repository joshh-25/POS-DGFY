import {
    money,
    resolveRulePreview
} from './affiliatePresentation.js';

export default function AffiliatePriceRulePreview({ draft, basePricePesos, commissionType, commissionRateBps, variant = 'default' }) {
    const preview = resolveRulePreview({ draft, basePricePesos, commissionType, commissionRateBps });

    if (preview.status === 'invalid') {
        const message = preview.errorCode === 'INVALID_DISCOUNT_PERCENTAGE'
            ? 'A discount cannot exceed 100%.'
            : preview.errorCode === 'NEGATIVE_BUYER_PRICE'
                ? 'This would make the buyer price negative.'
                : 'This rule is not valid yet.';
        return <p className="text-xs font-medium text-red-600">{message}</p>;
    }

    if (preview.status === 'error') {
        const message = preview.errorCode === 'UNRESOLVED_SETTLEMENT_POLICY'
            ? 'A discount and a commission are both active - choose a settlement policy in the settings below before this can be saved.'
            : 'Unable to calculate a preview for this combination.';
        return <p className="text-xs font-medium text-amber-600">{message}</p>;
    }

    const { breakdown } = preview;
    const isSettingsVariant = variant === 'settings';
    const isAffiliateActionsVariant = variant === 'affiliate-actions';

    const previewGridClass = isSettingsVariant
        ? 'affiliate-settings-preview grid grid-cols-3 divide-x divide-slate-200 divide-y-0'
        : isAffiliateActionsVariant
            ? 'affiliate-actions-preview grid grid-cols-3 gap-1.5 sm:gap-2'
            : 'grid grid-cols-1 gap-3 sm:grid-cols-3';
    const buyerCellClass = isSettingsVariant
        ? 'min-w-0 pr-2 sm:pr-4'
        : isAffiliateActionsVariant
            ? 'min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:p-3'
            : '';
    const affiliateCellClass = isSettingsVariant
        ? 'min-w-0 px-2 sm:px-4'
        : isAffiliateActionsVariant
            ? 'min-w-0 rounded-lg border border-blue-200 bg-blue-50/40 p-2 sm:p-3'
            : '';
    const netCellClass = isSettingsVariant
        ? 'min-w-0 pl-2 sm:pl-4'
        : isAffiliateActionsVariant
            ? 'min-w-0 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 sm:p-3'
            : '';
    const buyerLabelClass = isAffiliateActionsVariant ? 'text-slate-500' : 'text-slate-400';
    const affiliateLabelClass = isSettingsVariant || isAffiliateActionsVariant ? 'text-[#1A4E8D]' : 'text-slate-400';
    const netLabelClass = isSettingsVariant || isAffiliateActionsVariant ? 'text-emerald-600' : 'text-slate-400';
    const affiliateValueClass = isAffiliateActionsVariant ? 'text-[#1b4e8d]' : 'text-[#1A4E8D]';
    const previewDetailClass = isAffiliateActionsVariant
        ? 'mt-0.5 truncate text-[11px] text-slate-400'
        : 'mt-0.5 text-[11px] text-slate-400';
    const previewValueClass = isSettingsVariant
        ? 'mt-1 min-w-0 max-w-full break-words whitespace-normal text-[clamp(0.75rem,4.5vw,1rem)] font-black leading-tight [overflow-wrap:anywhere]'
        : 'mt-1 text-base font-black';

    return (
        <div className={previewGridClass}>
            <div className={buyerCellClass}>
                <div className={`text-[11px] font-semibold ${buyerLabelClass}`}>Buyer pays</div>
                <div className={`${previewValueClass} text-[#0F172A]`}>{money(breakdown.buyerTotalCentavos)}</div>
                <div className={previewDetailClass} title="Retail">Retail</div>
            </div>
            <div className={affiliateCellClass}>
                <div className={`text-[11px] font-semibold ${affiliateLabelClass}`}>Affiliate earns</div>
                <div className={`${previewValueClass} ${affiliateValueClass}`}>{money(breakdown.totalAffiliateEarningsCentavos)}</div>
                <div className={previewDetailClass} title="Commission">Commission</div>
            </div>
            <div className={netCellClass}>
                <div className={`text-[11px] font-semibold ${netLabelClass}`}>Your net</div>
                <div className={`${previewValueClass} text-emerald-700`}>{money(breakdown.merchantNetCentavos)}</div>
                <div className={previewDetailClass} title="Net earnings">Net earnings</div>
            </div>
        </div>
    );
}

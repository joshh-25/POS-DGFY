import { useMemo, useState } from 'react';
import {
    Ban,
    CheckCircle2,
    Eye,
    MoreVertical,
    Percent,
    UserRoundPlus,
    QrCode as QrCodeIcon,
    Save,
    SlidersHorizontal,
    Tag,
    Trash2,
    X,
    XCircle,
    UserCheck,
    Users,
    Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GlobalPagination, POS_PAGINATION_FOOTER_NO_DIVIDER_CLASS } from '@/components/ui/pagination';
import PosSearchField, {
    POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS
} from '../components/PosSearchField.jsx';
import PosMobileDataCard from '../components/PosMobileDataCard.jsx';
import PosTableActionButton from '../components/PosTableActionButton.jsx';
import PosTableSurface, {
    POS_TABLE_HEADER_CLASS,
    POS_TABLE_ROW_CLASS
} from '../components/PosTableSurface.jsx';
import { usePosViewportMode } from '../components/PosResponsiveFormDrawer.jsx';
import AffiliateFilterPopover from './AffiliateFilterPopover.jsx';
import AffiliatePendingInvites from './AffiliatePendingInvites.jsx';
import AffiliateStatCard from './AffiliateStatCard.jsx';
import AffiliateStatusBadge from './AffiliateStatusBadge.jsx';
import AffiliatePriceRulePreview from './AffiliatePriceRulePreview.jsx';
import {
    AFFILIATE_PAGE_SIZE_OPTIONS,
    AFFILIATE_SELLING_PRICE_RULE_TYPES,
    affiliateDisplayName,
    affiliateEmail,
    bpsToPercentString,
    formatAuditDateTime,
    formatAffiliateTableDate,
    getAffiliateEarnedCentavos,
    getAffiliateJoinedAt,
    getAffiliateSalesCentavos,
    getAffiliateUnpaidCentavos,
    normalizeSearch,
    phpMoney,
    PRICE_RULE_TYPE_LABELS,
    RATE_BASED_RULE_TYPES
} from './affiliatePresentation.js';

const FILTER_OPTIONS = [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'revoked', label: 'Revoked' }
];

const AFFILIATE_TABLE_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-left text-[13px] font-black uppercase leading-tight tracking-wide';
const AFFILIATE_TABLE_CELL_CLASS = 'px-2.5 py-2 text-left text-[13px] leading-4 text-[#334155] align-middle';
const AFFILIATE_TABLE_ACTION_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-center text-[13px] font-black uppercase leading-tight tracking-wide';
const AFFILIATE_TABLE_ACTION_CELL_CLASS = 'px-2.5 py-2 text-center text-[13px] leading-4 text-[#334155] align-middle';
const AFFILIATE_ACTION_BUTTON_CLASS = 'h-10 min-w-0 w-full justify-center rounded-lg px-2 text-[11px] font-bold';
const AFFILIATE_PRIMARY_BUTTON_CLASS = 'h-10 min-w-0 w-full shrink-0 justify-center rounded-lg bg-[#1b4e8d] px-2 text-[11px] font-bold text-white hover:bg-[#143f73] focus-visible:ring-[#1b4e8d] sm:w-[9.5rem]';
const AFFILIATE_LIST_COLUMN_WIDTHS = [
    'pos-affiliates-data-column pos-affiliates-identity-column',
    'pos-affiliates-data-column pos-affiliates-status-column',
    'pos-affiliates-data-column pos-affiliates-rate-column',
    'pos-affiliates-data-column pos-affiliates-amount-column',
    'pos-affiliates-data-column pos-affiliates-amount-column',
    'pos-affiliates-data-column pos-affiliates-amount-column',
    'pos-affiliates-data-column pos-affiliates-joined-column',
    'pos-affiliates-actions-column'
];

const formatTableAmount = (centavos, fallback = '—') => {
    if (centavos === null || centavos === undefined || !Number.isFinite(Number(centavos))) return fallback;
    return (Number(centavos) / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const auditActorLabel = (affiliate) => affiliate.revoked_by ?? 'Actor not recorded';
const auditReasonLabel = (affiliate) => affiliate.revocation_reason || 'Not recorded';

function AffiliateAuditDetails({ affiliate }) {
    if (affiliate.revoked_at == null) return null;

    return (
        <section aria-label="Latest status-audit" className="affiliate-actions-audit rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <p className="text-[12px] font-bold text-[#0F172A]">Latest status-audit</p>
            <dl className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
                <dt className="text-slate-500">Recorded at</dt>
                <dd className="min-w-0 justify-self-end break-words text-right font-medium text-[#0F172A]">{formatAuditDateTime(affiliate.revoked_at)}</dd>
                <dt className="text-slate-500">Tenant user ID</dt>
                <dd className="min-w-0 justify-self-end break-words text-right font-medium text-[#0F172A]">{auditActorLabel(affiliate)}</dd>
                <dt className="text-slate-500">Reason</dt>
                <dd className="min-w-0 justify-self-end break-words text-right font-medium text-[#0F172A]">{auditReasonLabel(affiliate)}</dd>
            </dl>
        </section>
    );
}

const getStatusCounts = (affiliates) => ({
    total: affiliates.length,
    active: affiliates.filter((affiliate) => affiliate.status === 'active').length
});

const affiliateMatches = (affiliate, query) => {
    if (!query) return true;
    const haystack = [
        affiliateDisplayName(affiliate),
        affiliateEmail(affiliate),
        affiliate.short_code,
        affiliate.status
    ].map(normalizeSearch).join(' ');
    return haystack.includes(query);
};

const getSalesSummary = (affiliates) => {
    const sales = affiliates.map(getAffiliateSalesCentavos).filter((value) => value !== null);
    return sales.length ? sales.reduce((total, value) => total + value, 0) : null;
};

function AffiliateActionPanel({
    affiliate,
    canManage,
    settingsDraft,
    previewBasePricePesos,
    rateEditValue,
    setRateEdit,
    busy,
    onSaveRate,
    qr,
    onToggleQr,
    ruleDraft,
    ruleEditorOpen,
    hasOwnPriceRule,
    ruleBusy,
    onToggleRuleEditor,
    onRuleDraftChange,
    onClearRule,
    onSaveRule,
    onToggleStatus,
    onReactivate
}) {
    const auditDetails = <AffiliateAuditDetails affiliate={affiliate} />;
    const status = String(affiliate.status || '').toLowerCase();
    const isActive = status === 'active';
    const canReactivate = status === 'suspended' || status === 'revoked';

    if (!canManage) {
        return (
            <div className="space-y-3">
                {auditDetails}
                <p className="text-xs text-slate-500">You have view-only access to affiliate records.</p>
            </div>
        );
    }

    return (
        <div className="affiliate-actions-panel space-y-2.5 sm:space-y-3">
            {auditDetails}

            <section aria-label="Affiliate controls" className="affiliate-actions-controls rounded-xl border border-slate-200 bg-white p-2.5 sm:p-4">
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <Percent aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400 sm:h-4 sm:w-4" />
                    <h3 id="affiliate-commission-heading" className="text-[12px] font-black uppercase tracking-wide text-slate-500">Commission rate</h3>
                </div>
                <div className="affiliate-actions-rate-row mt-2 flex min-w-0 flex-row items-center gap-1.5 sm:mt-3 sm:gap-2">
                    <label className="flex min-w-0 flex-1 items-center text-xs font-bold text-slate-600">
                        <span className="sr-only">Commission rate for {affiliateDisplayName(affiliate)}</span>
                        <div className="relative min-w-0 flex-1">
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                 className="h-10 min-w-0 bg-white pr-8 text-xs"
                                placeholder={affiliate.commission_rate_bps == null ? 'Default rate' : ''}
                                value={rateEditValue}
                                onChange={(event) => setRateEdit(event.target.value)}
                            />
                            <span aria-hidden="true" className="pointer-events-none absolute inset-y-2 right-3 flex items-center border-l border-slate-200 pl-2 text-xs font-bold text-slate-400">%</span>
                        </div>
                    </label>
                    <Button type="button" size="sm" disabled={busy} onClick={onSaveRate} className={`${AFFILIATE_PRIMARY_BUTTON_CLASS} affiliate-actions-rate-save`}>
                        <Save aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Save rate
                    </Button>
                </div>

                <div className="affiliate-actions-action-area mt-3 -mx-2.5 border-t border-slate-200 px-2.5 pt-3 sm:mt-4 sm:-mx-4 sm:px-4 sm:pt-4">
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        {!isActive && (
                            <p className="col-span-2 flex min-h-10 items-center rounded-md bg-slate-50 px-2 text-[11px] leading-4 text-slate-500 sm:text-xs">
                                Share link becomes available after this affiliate is active.
                            </p>
                        )}
                        {isActive && (
                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onToggleQr} className={`${AFFILIATE_ACTION_BUTTON_CLASS} whitespace-nowrap border-slate-200 text-slate-600 hover:border-[#1b4e8d] hover:bg-[#f3f7fc] hover:text-[#1b4e8d]`}>
                                <QrCodeIcon aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 text-[#1b4e8d]" /> {qr ? 'Hide' : 'Share Link'}
                            </Button>
                        )}
                        {isActive ? (
                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onToggleStatus('suspended')} className={`${AFFILIATE_ACTION_BUTTON_CLASS} whitespace-nowrap border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800`}>
                                <Ban aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Suspend
                            </Button>
                        ) : canReactivate ? (
                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onReactivate()} className={`${AFFILIATE_ACTION_BUTTON_CLASS} whitespace-nowrap border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800`}>
                                <CheckCircle2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Reactivate
                            </Button>
                        ) : null}
                        {status !== 'revoked' && (
                            <Button type="button" size="sm" variant="outline" className={`${AFFILIATE_ACTION_BUTTON_CLASS} whitespace-nowrap border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700`} disabled={busy} onClick={() => onToggleStatus('revoked')}>
                                <XCircle aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Revoke
                            </Button>
                        )}
                        <Button type="button" size="sm" variant="outline" onClick={onToggleRuleEditor} className={`${AFFILIATE_ACTION_BUTTON_CLASS} ${status === 'suspended' ? 'col-span-2 sm:col-span-2' : ''} whitespace-nowrap border-slate-200 text-slate-600 hover:border-[#1b4e8d] hover:bg-[#f3f7fc] hover:text-[#1b4e8d]`}>
                            <Tag aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 text-[#1b4e8d]" />
                            {ruleEditorOpen ? 'Hide price override' : hasOwnPriceRule ? 'Edit price override' : 'Set price override'}
                        </Button>
                    </div>
                </div>
            </section>

            {ruleEditorOpen && ruleDraft && (
                <section aria-labelledby="affiliate-pricing-heading" className="affiliate-actions-pricing-section rounded-xl border border-slate-200 bg-white p-2.5 sm:p-4">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Tag aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400 sm:h-4 sm:w-4" />
                        <h3 id="affiliate-pricing-heading" className="text-[12px] font-black uppercase tracking-wide text-slate-500">Pricing rule</h3>
                    </div>

                    <div className="affiliate-actions-pricing-row mt-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:mt-3 sm:flex-nowrap sm:items-end sm:gap-2">
                        <div className="affiliate-actions-rule-select min-w-0 flex-1">
                            <label className="sr-only">Pricing rule</label>
                            <Select
                                className="relative affiliate-actions-select"
                                value={ruleDraft.rule_type}
                                onValueChange={(value) => onRuleDraftChange({ rule_type: value, value: '' })}
                            >
                                <SelectTrigger className="h-10 min-w-0 bg-white text-xs"><SelectValue className="min-w-0 flex-1 truncate whitespace-nowrap text-left" /></SelectTrigger>
                                <SelectContent className="affiliate-actions-select-content">
                                    {AFFILIATE_SELLING_PRICE_RULE_TYPES.map((type) => (
                                        <SelectItem key={type} value={type} className="whitespace-nowrap text-xs">{PRICE_RULE_TYPE_LABELS[type]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {ruleDraft.rule_type !== 'BASE_PRICE' && (
                            <div className="affiliate-actions-rule-value min-w-0 flex-1 sm:w-24 sm:flex-none">
                                <label
                                    htmlFor="affiliate-pricing-value"
                                    className="sr-only"
                                >
                                    {RATE_BASED_RULE_TYPES.has(ruleDraft.rule_type) ? 'Percentage' : 'Amount (PHP)'}
                                </label>
                                <div className="relative">
                                    <Input
                                        id="affiliate-pricing-value"
                                        type="number"
                                        min="0"
                                        step={RATE_BASED_RULE_TYPES.has(ruleDraft.rule_type) ? '0.1' : '1'}
                                        className={RATE_BASED_RULE_TYPES.has(ruleDraft.rule_type) ? 'h-10 bg-white pr-8 text-xs' : 'h-10 bg-white pl-10 text-xs'}
                                        value={ruleDraft.value}
                                        onChange={(event) => onRuleDraftChange({ ...ruleDraft, value: event.target.value })}
                                    />
                                    {RATE_BASED_RULE_TYPES.has(ruleDraft.rule_type) ? (
                                        <span aria-hidden="true" className="pointer-events-none absolute inset-y-2 right-3 flex items-center border-l border-slate-200 pl-2 text-xs font-bold text-slate-400">%</span>
                                    ) : (
                                        <span aria-hidden="true" className="pointer-events-none absolute inset-y-2 left-3 flex items-center border-r border-slate-200 pr-2 text-xs font-bold text-slate-400">₱</span>
                                    )}
                                </div>
                            </div>
                        )}
                        <Button type="button" size="sm" disabled={ruleBusy} onClick={onSaveRule} className={AFFILIATE_PRIMARY_BUTTON_CLASS}>
                            <Save aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> {ruleBusy ? 'Saving...' : 'Save override'}
                        </Button>
                    </div>

                    <div className="mt-3 sm:mt-4">
                        <AffiliatePriceRulePreview
                            variant="affiliate-actions"
                            draft={ruleDraft}
                            basePricePesos={previewBasePricePesos}
                            commissionType={affiliate.commission_type || settingsDraft?.commission_type}
                            commissionRateBps={affiliate.commission_rate_bps ?? settingsDraft?.default_rate_bps}
                        />
                    </div>

                    {hasOwnPriceRule && (
                        <div className="mt-2 flex sm:mt-3 sm:justify-end">
                            <Button type="button" size="sm" variant="outline" disabled={ruleBusy} onClick={onClearRule} className="h-10 min-w-0 w-full justify-center rounded-lg px-2 text-[11px] font-bold text-rose-600 sm:w-auto">
                                <Trash2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Remove override
                            </Button>
                        </div>
                    )}
                </section>
            )}

            {qr && (
                    <div className="affiliate-actions-qr flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-3">
                    {qr.dataUrl ? (
                        <img src={qr.dataUrl} alt={`QR code for ${affiliate.short_code}`} className="h-28 w-28 rounded-lg border border-slate-200" />
                    ) : (
                        <p className="text-xs text-slate-500">No public storefront URL is configured yet - share the code directly.</p>
                    )}
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Share code</p>
                        <p className="mt-1 text-sm font-black text-[#0F172A]">{qr.short_code}</p>
                        {qr.url && <p className="mt-1 max-w-xl break-all text-xs text-[#1A4E8D]">{qr.url}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

function AffiliateTableRow({ affiliate, ...props }) {
    const {
        actionOpen,
        onToggleActions
    } = props;
    const sales = getAffiliateSalesCentavos(affiliate);
    const isRateDefault = affiliate.commission_rate_bps === null || affiliate.commission_rate_bps === undefined;

    return (
        <tr className={POS_TABLE_ROW_CLASS}>
            <td className={AFFILIATE_TABLE_CELL_CLASS}>
                <div className="min-w-0">
                    <div className="truncate font-black text-[#0F172A]">{affiliateDisplayName(affiliate)}</div>
                    <div className="mt-0.5 truncate whitespace-nowrap text-[13px] text-slate-400" title={affiliateEmail(affiliate)}>{affiliateEmail(affiliate)}</div>
                    <div className="mt-0.5 break-words text-[13px] text-slate-400" title={affiliate.short_code}>Code {affiliate.short_code}</div>
                </div>
                {affiliate.revoked_at != null && (
                    <div
                        className="mt-0.5 min-w-0 truncate text-[11px] leading-4 text-slate-400"
                        title={`Latest status-audit · Recorded at ${formatAuditDateTime(affiliate.revoked_at)} · Tenant user ID ${auditActorLabel(affiliate)} · Reason ${auditReasonLabel(affiliate)}`}
                    >
                        Audit {formatAuditDateTime(affiliate.revoked_at)} · ID {auditActorLabel(affiliate)}
                    </div>
                )}
            </td>
            <td className={`${AFFILIATE_TABLE_CELL_CLASS} pos-affiliates-status-cell whitespace-nowrap`}><AffiliateStatusBadge status={affiliate.status} /></td>
            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap tabular-nums`}>{isRateDefault ? 'Default' : `${bpsToPercentString(affiliate.commission_rate_bps)}%`}</td>
            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap font-semibold tabular-nums`}>{formatTableAmount(sales)}</td>
            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap font-semibold tabular-nums`}>{formatTableAmount(getAffiliateEarnedCentavos(affiliate), '0.00')}</td>
            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap font-semibold tabular-nums`}>{formatTableAmount(getAffiliateUnpaidCentavos(affiliate), '0.00')}</td>
            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap text-slate-500`}>{formatAffiliateTableDate(getAffiliateJoinedAt(affiliate))}</td>
            <td className={AFFILIATE_TABLE_ACTION_CELL_CLASS}>
                <div className="flex w-full items-center justify-center">
                    <PosTableActionButton
                        icon={MoreVertical}
                        aria-label={`Actions for ${affiliateDisplayName(affiliate)}`}
                        aria-expanded={actionOpen}
                        onClick={onToggleActions}
                    />
                </div>
            </td>
        </tr>
    );
}

function AffiliateMobileCard({ affiliate, actionOpen, onToggleActions, detailsOpen, onToggleDetails }) {
    const sales = getAffiliateSalesCentavos(affiliate);
    const isRateDefault = affiliate.commission_rate_bps === null || affiliate.commission_rate_bps === undefined;
    const displayName = affiliateDisplayName(affiliate);

    return (
        <PosMobileDataCard
            titleLabel="Affiliate"
            title={displayName}
            fields={[
                { key: 'status', label: 'Status', value: <AffiliateStatusBadge status={affiliate.status} />, align: 'right' }
            ]}
            collapsibleFields={[
                { key: 'email', label: 'Email', value: affiliateEmail(affiliate), valueClassName: 'text-slate-500', align: 'right' },
                { key: 'rate', label: 'Rate', value: isRateDefault ? 'Default' : `${bpsToPercentString(affiliate.commission_rate_bps)}%`, align: 'right', numeric: true },
                { key: 'sales', label: 'Sales (₱)', value: formatTableAmount(sales), align: 'right', numeric: true },
                { key: 'earned', label: 'Earned (₱)', value: formatTableAmount(getAffiliateEarnedCentavos(affiliate), '0.00'), align: 'right', numeric: true },
                { key: 'unpaid', label: 'Unpaid (₱)', value: formatTableAmount(getAffiliateUnpaidCentavos(affiliate), '0.00'), align: 'right', numeric: true },
                { key: 'joined', label: 'Joined', value: formatAffiliateTableDate(getAffiliateJoinedAt(affiliate)), valueClassName: 'text-slate-500', align: 'right' },
                ...(affiliate.revoked_at != null ? [{
                    key: 'audit',
                    label: 'Audit',
                    value: `${formatAuditDateTime(affiliate.revoked_at)} · ID ${auditActorLabel(affiliate)}`,
                    valueClassName: 'text-slate-400'
                }] : [])
            ]}
            expanded={detailsOpen}
            detailsId={`affiliate-mobile-details-${affiliate.enrollment_id}`}
            detailsLabel={`Additional details for ${displayName}`}
            action={(
                <div className="flex shrink-0 items-center gap-1">
                    <PosTableActionButton
                        icon={Eye}
                        className={detailsOpen ? 'bg-blue-50' : undefined}
                        aria-label={`${detailsOpen ? 'Hide' : 'Show'} details for ${displayName}`}
                        aria-expanded={detailsOpen}
                        aria-controls={`affiliate-mobile-details-${affiliate.enrollment_id}`}
                        title={`${detailsOpen ? 'Hide' : 'Show'} details`}
                        onClick={onToggleDetails}
                    />
                    <PosTableActionButton
                        icon={MoreVertical}
                        aria-label={`Actions for ${displayName}`}
                        aria-expanded={actionOpen}
                        onClick={onToggleActions}
                    />
                </div>
            )}
            className="shadow-sm shadow-slate-200/40"
        />
    );
}

export default function AffiliateListView({
    affiliates = [],
    canManage,
    settingsDraft,
    priceRules,
    previewBasePricePesos,
    rateEdits,
    setRateEdits,
    rowBusyId,
    qrByEnrollment,
    affiliateRuleDrafts,
    setAffiliateRuleDrafts,
    affiliateRuleBusyId,
    expandedRuleEnrollmentId,
    onToggleAffiliateRuleEditor,
    onClearAffiliateRule,
    onSaveAffiliateRule,
    onSaveRate,
    onToggleQr,
    onStatusChange,
    onReactivate,
    onOpenInvite,
    invites = [],
    inviteBusyId,
    onCancelInvite
}) {
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(AFFILIATE_PAGE_SIZE_OPTIONS[0]);
    const [actionEnrollmentId, setActionEnrollmentId] = useState(null);
    const [expandedAffiliateId, setExpandedAffiliateId] = useState(null);
    const viewportMode = usePosViewportMode();
    const isMobileViewport = viewportMode === 'mobile';

    const filteredAffiliates = useMemo(() => {
        const normalizedQuery = normalizeSearch(query);
        return affiliates.filter((affiliate) => (
            (statusFilter === 'all' || affiliate.status === statusFilter)
            && affiliateMatches(affiliate, normalizedQuery)
        ));
    }, [affiliates, query, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredAffiliates.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const visibleAffiliates = filteredAffiliates.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
    const activeAffiliate = useMemo(
        () => affiliates.find((affiliate) => affiliate.enrollment_id === actionEnrollmentId) || null,
        [actionEnrollmentId, affiliates]
    );
    const counts = getStatusCounts(affiliates);
    const sales = getSalesSummary(affiliates);

    const getAffiliateRowProps = (affiliate) => {
        const enrollmentId = affiliate.enrollment_id;
        const existingRule = priceRules.find((rule) => rule.enrollment_id === enrollmentId && rule.item_id === 0);
        return {
            affiliate,
            actionOpen: actionEnrollmentId === enrollmentId,
            onToggleActions: () => setActionEnrollmentId((current) => current === enrollmentId ? null : enrollmentId),
            detailsOpen: expandedAffiliateId === enrollmentId,
            onToggleDetails: () => setExpandedAffiliateId((current) => current === enrollmentId ? null : enrollmentId),
            canManage,
            settingsDraft,
            previewBasePricePesos,
            rateEditValue: rateEdits[enrollmentId] !== undefined ? rateEdits[enrollmentId] : bpsToPercentString(affiliate.commission_rate_bps),
            setRateEdit: (value) => setRateEdits((previous) => ({ ...previous, [enrollmentId]: value })),
            busy: rowBusyId === enrollmentId,
            onSaveRate: () => onSaveRate(affiliate),
            qr: qrByEnrollment[enrollmentId],
            onToggleQr: () => onToggleQr(affiliate),
            ruleDraft: affiliateRuleDrafts[enrollmentId],
            ruleEditorOpen: expandedRuleEnrollmentId === enrollmentId,
            hasOwnPriceRule: Boolean(existingRule),
            ruleBusy: affiliateRuleBusyId === enrollmentId,
            onToggleRuleEditor: () => onToggleAffiliateRuleEditor(affiliate),
            onRuleDraftChange: (nextDraft) => setAffiliateRuleDrafts((previous) => ({ ...previous, [enrollmentId]: nextDraft })),
            onClearRule: () => onClearAffiliateRule(affiliate),
            onSaveRule: () => onSaveAffiliateRule(affiliate),
            onToggleStatus: (status) => onStatusChange(affiliate, status),
            onReactivate: () => onReactivate(affiliate)
        };
    };

    const statCards = [
        { label: 'Total affiliates', value: counts.total, icon: Users, tone: 'cyan' },
        { label: 'Active affiliates', value: counts.active, icon: UserCheck, tone: 'green' },
        { label: 'Affiliate sales', value: phpMoney(sales), icon: Wallet, tone: 'blue' },
        { label: 'Commissions owed', value: phpMoney(affiliates.reduce((total, affiliate) => total + getAffiliateUnpaidCentavos(affiliate), 0)), icon: Wallet, tone: 'amber' }
    ];

    return (
    <div id="affiliate-panel-list" role="tabpanel" aria-label="Affiliates list" className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
            <div data-testid="affiliate-list-scroll-region" className="affiliate-list-scroll-region dgfy-pos-scroll-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto pr-1 touch-pan-y">
            <div className="grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-4 affiliate-kpi-strip">
                {statCards.map((card) => <AffiliateStatCard key={card.label} {...card} />)}
            </div>

            <div className="shrink-0">
                <div className="hidden items-center gap-2 sm:flex">
                    <PosSearchField
                        id="affiliate-list-search"
                        ariaLabel="Search affiliates"
                        placeholder="Search affiliates"
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }}
                        onClear={() => { setQuery(''); setCurrentPage(1); }}
                        variant="catalog"
                        inputClassName={POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS}
                        className="min-w-0 flex-1"
                    />
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <AffiliateFilterPopover
                            value={statusFilter}
                            onChange={(value) => { setStatusFilter(value); setCurrentPage(1); }}
                            options={FILTER_OPTIONS}
                            testId="affiliate-list-filter"
                        />
                        {canManage && (
                            <Button type="button" onClick={onOpenInvite} className="pos-items-primary-action h-9 rounded-lg bg-[#1A4E8D] px-3 text-[13px] text-white hover:bg-[#143F73] active:bg-[#143F73]">
                                <UserRoundPlus aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Invite Affiliate
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:hidden">
                    <PosSearchField
                        id="affiliate-list-search-mobile"
                        ariaLabel="Search affiliates"
                        placeholder="Search"
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }}
                        onClear={() => { setQuery(''); setCurrentPage(1); }}
                        variant="catalog"
                        inputClassName={POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS}
                        className="affiliate-mobile-search min-w-0 flex-1"
                    />
                    <AffiliateFilterPopover
                        value={statusFilter}
                        onChange={(value) => { setStatusFilter(value); setCurrentPage(1); }}
                        options={FILTER_OPTIONS}
                        mobileOnly
                        testId="affiliate-list-mobile-filter"
                    />
                    {canManage && (
                        <Button type="button" onClick={onOpenInvite} aria-label="Invite affiliate" title="Invite affiliate" className="affiliate-mobile-toolbar-button">
                            <UserRoundPlus aria-hidden="true" />
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex min-w-0 shrink-0 flex-col gap-0">
                <PosTableSurface className="flex min-w-0 shrink-0 flex-col">
                    <div data-testid="affiliate-table-region" className="affiliate-table-region min-w-0">
                        {isMobileViewport ? (
                            <div data-testid="affiliate-mobile-records" className="grid min-w-0 gap-2 p-2">
                                {visibleAffiliates.map((affiliate) => (
                                    <AffiliateMobileCard key={affiliate.enrollment_id} {...getAffiliateRowProps(affiliate)} />
                                ))}
                                {visibleAffiliates.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-[13px] font-medium text-slate-500">
                                        {affiliates.length === 0 ? 'No affiliates enrolled yet.' : 'No affiliates match the current search or filter.'}
                                    </div>
                                )}
                            </div>
                        ) : (
                         <table aria-label="Affiliate list table" className="pos-affiliates-data-table pos-affiliates-list-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]">
                        <colgroup>
                            {AFFILIATE_LIST_COLUMN_WIDTHS.map((className, index) => <col key={index} className={className} />)}
                        </colgroup>
                        <thead className={`${POS_TABLE_HEADER_CLASS} sticky top-0 z-10`}>
                            <tr className="h-12">
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Affiliate</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Status</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Rate</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Sales (₱)</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Earned (₱)</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Unpaid (₱)</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Joined</th>
                                <th className={AFFILIATE_TABLE_ACTION_HEADER_CELL_CLASS}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleAffiliates.map((affiliate) => <AffiliateTableRow key={affiliate.enrollment_id} {...getAffiliateRowProps(affiliate)} />)}
                            {visibleAffiliates.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500 max-[767px]:text-[13px]">
                                        {affiliates.length === 0 ? 'No affiliates enrolled yet.' : 'No affiliates match the current search or filter.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        </table>
                        )}
                    </div>
                </PosTableSurface>
                <GlobalPagination
                    testId="affiliate-list-pagination"
                    ariaLabel="Affiliate list pagination"
                    currentPage={safeCurrentPage}
                    totalPages={totalPages}
                    totalItems={filteredAffiliates.length}
                    pageSize={pageSize}
                    pageSizeOptions={AFFILIATE_PAGE_SIZE_OPTIONS}
                    hidePageSizeSuffixOnMobile
                    itemLabel="entries"
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(nextPageSize) => {
                        if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) return;
                        setPageSize(nextPageSize);
                        setCurrentPage(1);
                    }}
                    accentColor="#1A4E8D"
                    className={POS_PAGINATION_FOOTER_NO_DIVIDER_CLASS}
                />
            </div>

            {canManage && invites.length > 0 && (
                <div className="shrink-0">
                    <AffiliatePendingInvites
                        invites={invites}
                        canManage={canManage}
                        inviteBusyId={inviteBusyId}
                        onCancel={onCancelInvite}
                    />
                </div>
            )}
            </div>

            <Dialog
                open={Boolean(activeAffiliate)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) setActionEnrollmentId(null);
                }}
            >
                <DialogContent
                    data-testid="affiliate-actions-dialog"
                    className="affiliate-actions-dialog max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:max-h-[calc(100vh-2rem)] sm:w-full"
                >
                    <DialogHeader className="affiliate-actions-header border-b border-slate-100 px-3 py-2.5 text-left sm:px-5 sm:py-3">
                        <div className="flex items-center justify-between gap-2 sm:gap-3">
                            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-[#1b4e8d] sm:h-10 sm:w-10 sm:rounded-xl">
                                    <SlidersHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                </span>
                                <div className="min-w-0">
                                    <DialogTitle className="text-[15px] font-extrabold text-[#0F172A] sm:text-[16px]">Affiliate actions</DialogTitle>
                                    <DialogDescription className="mt-0 truncate text-[11px] leading-4 text-[#64748B] sm:mt-0.5">
                                        {activeAffiliate ? (
                                            <>
                                                <span className="font-bold text-[#334155]">{affiliateDisplayName(activeAffiliate)}</span>
                                                <span aria-hidden="true"> · </span>
                                                <span>{affiliateEmail(activeAffiliate)}</span>
                                            </>
                                        ) : ''}
                                    </DialogDescription>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Close affiliate actions dialog"
                                onClick={() => setActionEnrollmentId(null)}
                                className="h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                                <X aria-hidden="true" className="h-4 w-4" />
                            </Button>
                        </div>
                    </DialogHeader>
                    {activeAffiliate && (
                        <div className="affiliate-actions-body px-3 py-3 sm:px-5 sm:py-6">
                            <AffiliateActionPanel
                                affiliate={activeAffiliate}
                                canManage={canManage}
                                settingsDraft={settingsDraft}
                                previewBasePricePesos={previewBasePricePesos}
                                rateEditValue={rateEdits[activeAffiliate.enrollment_id] !== undefined
                                    ? rateEdits[activeAffiliate.enrollment_id]
                                    : bpsToPercentString(activeAffiliate.commission_rate_bps)}
                                setRateEdit={(value) => setRateEdits((previous) => ({ ...previous, [activeAffiliate.enrollment_id]: value }))}
                                busy={rowBusyId === activeAffiliate.enrollment_id}
                                onSaveRate={() => onSaveRate(activeAffiliate)}
                                qr={qrByEnrollment[activeAffiliate.enrollment_id]}
                                onToggleQr={() => onToggleQr(activeAffiliate)}
                                ruleDraft={affiliateRuleDrafts[activeAffiliate.enrollment_id]}
                                ruleEditorOpen={expandedRuleEnrollmentId === activeAffiliate.enrollment_id}
                                hasOwnPriceRule={Boolean(priceRules.find((rule) => rule.enrollment_id === activeAffiliate.enrollment_id && rule.item_id === 0))}
                                ruleBusy={affiliateRuleBusyId === activeAffiliate.enrollment_id}
                                onToggleRuleEditor={() => onToggleAffiliateRuleEditor(activeAffiliate)}
                                onRuleDraftChange={(nextDraft) => setAffiliateRuleDrafts((previous) => ({ ...previous, [activeAffiliate.enrollment_id]: nextDraft }))}
                                onClearRule={() => onClearAffiliateRule(activeAffiliate)}
                                onSaveRule={() => onSaveAffiliateRule(activeAffiliate)}
                                onToggleStatus={(status) => onStatusChange(activeAffiliate, status)}
                                onReactivate={() => onReactivate(activeAffiliate)}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

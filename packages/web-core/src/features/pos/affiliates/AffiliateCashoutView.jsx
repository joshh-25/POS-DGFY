import { useMemo, useState } from 'react';
import {
    Banknote,
    Check,
    CheckCircle2,
    Download,
    Eye,
    MoreVertical,
    Wallet,
    WalletCards,
    X,
    XCircle,
    Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import AffiliateStatCard from './AffiliateStatCard.jsx';
import AffiliateStatusBadge from './AffiliateStatusBadge.jsx';
import {
    AFFILIATE_PAGE_SIZE_OPTIONS,
    buildCashoutCsv,
    cashoutAffiliateDisplayName,
    formatCashoutRequestId,
    formatAffiliateTableDate,
    money,
    normalizeSearch,
    phpMoney,
    statusLabel
} from './affiliatePresentation.js';

const FILTER_OPTIONS = [
    { value: 'all', label: 'All statuses' },
    { value: 'requested', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'paid', label: 'Paid' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' }
];

const AFFILIATE_TABLE_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-left text-[13px] font-black uppercase leading-tight tracking-wide';
const AFFILIATE_TABLE_CELL_CLASS = 'px-2.5 py-2 text-left text-[13px] leading-4 text-[#334155] align-middle';
const AFFILIATE_TABLE_ACTION_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-center text-[13px] font-black uppercase leading-tight tracking-wide';
const AFFILIATE_TABLE_ACTION_CELL_CLASS = 'px-2.5 py-2 text-center text-[13px] leading-4 text-[#334155] align-middle';
const AFFILIATE_MODAL_BUTTON_CLASS = 'h-10 min-w-0 w-full justify-center rounded-lg px-2 text-[11px] font-bold';
const AFFILIATE_MODAL_PRIMARY_BUTTON_CLASS = `${AFFILIATE_MODAL_BUTTON_CLASS} bg-[#1b4e8d] text-white hover:bg-[#143f73] focus-visible:ring-[#1b4e8d]`;
const AFFILIATE_MODAL_DANGER_BUTTON_CLASS = `${AFFILIATE_MODAL_BUTTON_CLASS} border-rose-200 bg-rose-50/30 text-rose-600 hover:bg-rose-50 hover:text-rose-700`;
const AFFILIATE_CASHOUT_COLUMN_WIDTHS = [
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-actions-column'
];

const cashoutMatches = (cashout, query) => {
    if (!query) return true;
    return [
        cashoutAffiliateDisplayName(cashout),
        formatCashoutRequestId(cashout),
        cashout.status,
        cashout.external_payment_ref
    ].map(normalizeSearch).join(' ').includes(query);
};

const payoutMethodLabel = (snapshot) => {
    if (snapshot?.method_type === 'gcash') return 'GCash';
    if (snapshot?.method_type === 'maya') return 'Maya';
    if (snapshot?.method_type === 'bank') return snapshot.bank_name || 'Bank';
    return snapshot?.method_type || 'Payout';
};

const payoutDestination = (snapshot) => {
    if (!snapshot) return 'Details unavailable';
    if (snapshot.method_type === 'bank') {
        const last4 = String(snapshot.account_number || '').slice(-4);
        return last4 ? `•••• ${last4}` : 'Account details unavailable';
    }
    return snapshot.mobile_number || 'Mobile number unavailable';
};

function CashoutActionPanel({
    cashout,
    canApproveCashouts,
    canPayCashouts,
    busy,
    payoutReference,
    onPayoutReferenceChange,
    rejectionReason,
    onRejectionReasonChange,
    onApprove,
    onMarkPaid,
    onReject
}) {
    const isRequested = cashout.status === 'requested';
    const isApproved = cashout.status === 'approved';
    const canReject = canApproveCashouts && (isRequested || isApproved);
    const canApprove = canApproveCashouts && isRequested;
    const canMarkPaid = canPayCashouts && isApproved;
    const hasFooterActions = canReject || canApprove || canMarkPaid;
    const footerActionClass = [canReject, canApprove, canMarkPaid].filter(Boolean).length === 1 ? 'col-span-2' : '';

    const payoutStatusMessage = () => {
        if (!canApproveCashouts && !canPayCashouts) return 'You have view-only access to cashout records.';
        if (cashout.status === 'paid') return 'This cashout request has already been paid.';
        if (cashout.status === 'rejected') return 'This cashout request was rejected.';
        if (cashout.status === 'cancelled') return 'This cashout request was cancelled.';
        return `This cashout request is currently ${statusLabel(cashout.status).toLowerCase()}.`;
    };

    return (
        <>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-5">
                {isRequested && canApproveCashouts && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <label htmlFor={`affiliate-cashout-rejection-${cashout.cashout_id}`} className="text-[12px] font-black uppercase tracking-wide text-slate-600">
                                Rejection reason
                            </label>
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">optional</span>
                        </div>
                        <Input
                            id={`affiliate-cashout-rejection-${cashout.cashout_id}`}
                            placeholder="Rejection reason (optional)"
                            value={rejectionReason}
                            onChange={(event) => onRejectionReasonChange(event.target.value)}
                            className="h-10 rounded-lg border-slate-300 bg-white text-[14px] font-normal text-[#0F172A] placeholder:text-slate-400 focus:border-[#1b4e8d] focus-visible:ring-[#1b4e8d]/20"
                        />
                        <p className="text-[11px] leading-4 text-slate-400">Provide context if you are denying this payout request.</p>
                    </div>
                )}
                {isApproved && canPayCashouts && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <label htmlFor={`affiliate-cashout-payment-reference-${cashout.cashout_id}`} className="text-[12px] font-black uppercase tracking-wide text-slate-600">
                                Payment reference
                            </label>
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">required</span>
                        </div>
                        <Input
                            id={`affiliate-cashout-payment-reference-${cashout.cashout_id}`}
                            placeholder="External payment reference"
                            value={payoutReference}
                            onChange={(event) => onPayoutReferenceChange(event.target.value)}
                            className="h-10 rounded-lg border-slate-300 bg-white text-[14px] font-normal text-[#0F172A] placeholder:text-slate-400 focus:border-[#1b4e8d] focus-visible:ring-[#1b4e8d]/20"
                        />
                        <p className="text-[11px] leading-4 text-slate-400">Record the external payment reference before marking this payout as paid.</p>
                    </div>
                )}
                {!isRequested && !isApproved && (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-4 text-slate-500">
                        {payoutStatusMessage()}
                        {cashout.external_payment_ref && <span className="mt-1 block">Payment reference: {cashout.external_payment_ref}</span>}
                        {cashout.rejection_reason && <span className="mt-1 block">Reason: {cashout.rejection_reason}</span>}
                    </p>
                )}
                {(isRequested || isApproved) && !hasFooterActions && (
                    <p className="text-[12px] leading-4 text-slate-400">{payoutStatusMessage()}</p>
                )}
            </div>

            {hasFooterActions && (
                <div className="affiliate-cashout-dialog-footer flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-4 py-2.5 sm:px-5">
                    <div className="grid w-full grid-cols-2 gap-3">
                        {canReject && (
                            <Button type="button" variant="outline" className={`${AFFILIATE_MODAL_DANGER_BUTTON_CLASS} ${footerActionClass}`} disabled={busy} onClick={onReject}>
                                <XCircle aria-hidden="true" className="mr-1.5 h-4 w-4" /> Reject
                            </Button>
                        )}
                        {canApprove && (
                            <Button type="button" className={`${AFFILIATE_MODAL_PRIMARY_BUTTON_CLASS} ${footerActionClass}`} disabled={busy} onClick={onApprove}>
                                <Check aria-hidden="true" className="mr-1.5 h-4 w-4" /> Approve
                            </Button>
                        )}
                        {canMarkPaid && (
                            <Button type="button" className={`${AFFILIATE_MODAL_PRIMARY_BUTTON_CLASS} ${footerActionClass}`} disabled={busy} onClick={onMarkPaid}>
                                <Banknote aria-hidden="true" className="mr-1.5 h-4 w-4" /> Mark Paid
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

function AffiliateCashoutMobileCard({ cashout, affiliate, actionOpen, onToggleActions, detailsOpen, onToggleDetails }) {
    const email = affiliate?.dgfyAccount?.email || cashout.enrollment?.dgfyAccount?.email || 'Email unavailable';
    const displayName = cashoutAffiliateDisplayName(cashout);

    return (
        <PosMobileDataCard
            titleLabel="Affiliate"
            title={displayName}
            fields={[
                { key: 'status', label: 'Status', value: <AffiliateStatusBadge status={cashout.status} />, align: 'right' }
            ]}
            collapsibleFields={[
                { key: 'request-id', label: 'Request ID', value: formatCashoutRequestId(cashout), valueClassName: 'font-mono text-slate-500', align: 'right' },
                { key: 'email', label: 'Email', value: email, valueClassName: 'text-slate-500', align: 'right' },
                { key: 'amount', label: 'Amount (₱)', value: money(cashout.amount_centavos), align: 'right', numeric: true },
                { key: 'available', label: 'Available (₱)', value: affiliate ? money(affiliate.earnings?.available_centavos) : '—', valueClassName: 'text-slate-600', align: 'right', numeric: true },
                { key: 'date', label: 'Date', value: formatAffiliateTableDate(cashout.requested_at), valueClassName: 'text-slate-500', align: 'right' }
            ]}
            expanded={detailsOpen}
            detailsId={`affiliate-cashout-mobile-details-${cashout.cashout_id}`}
            detailsLabel={`Additional details for ${displayName}`}
            action={(
                <div className="flex shrink-0 items-center gap-1">
                    <PosTableActionButton
                        icon={Eye}
                        className={detailsOpen ? 'bg-blue-50' : undefined}
                        aria-label={`${detailsOpen ? 'Hide' : 'Show'} details for ${displayName}`}
                        aria-expanded={detailsOpen}
                        aria-controls={`affiliate-cashout-mobile-details-${cashout.cashout_id}`}
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

export default function AffiliateCashoutView({
    cashouts = [],
    affiliates = [],
    canApproveCashouts,
    canPayCashouts,
    cashoutBusyId,
    payoutRefDrafts,
    setPayoutRefDrafts,
    rejectReasonDrafts,
    setRejectReasonDrafts,
    onApprove,
    onMarkPaid,
    onReject
}) {
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(AFFILIATE_PAGE_SIZE_OPTIONS[0]);
    const [actionCashoutId, setActionCashoutId] = useState(null);
    const [expandedCashoutId, setExpandedCashoutId] = useState(null);
    const viewportMode = usePosViewportMode();
    const isMobileViewport = viewportMode === 'mobile';

    const filteredCashouts = useMemo(() => {
        const normalizedQuery = normalizeSearch(query);
        return cashouts.filter((cashout) => (
            (statusFilter === 'all' || cashout.status === statusFilter)
            && cashoutMatches(cashout, normalizedQuery)
        ));
    }, [cashouts, query, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredCashouts.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const visibleCashouts = filteredCashouts.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
    const activeCashout = useMemo(
        () => cashouts.find((cashout) => cashout.cashout_id === actionCashoutId) || null,
        [actionCashoutId, cashouts]
    );

    const affiliateByEnrollment = useMemo(() => new Map(
        affiliates.map((affiliate) => [String(affiliate.enrollment_id), affiliate])
    ), [affiliates]);

    const getCashoutAffiliate = (cashout) => affiliateByEnrollment.get(String(cashout.enrollment_id ?? cashout.enrollment?.enrollment_id));

    const exportCashouts = () => {
        const blob = new Blob([buildCashoutCsv(filteredCashouts)], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'affiliate-cashouts.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const cards = [
        { label: 'Pending', value: cashouts.filter((cashout) => cashout.status === 'requested').length, icon: Clock, tone: 'amber' },
        { label: 'Approved', value: cashouts.filter((cashout) => cashout.status === 'approved').length, icon: CheckCircle2, tone: 'blue' },
        { label: 'Paid', value: cashouts.filter((cashout) => cashout.status === 'paid').length, icon: Banknote, tone: 'green' },
        { label: 'Rejected', value: cashouts.filter((cashout) => cashout.status === 'rejected').length, icon: XCircle, tone: 'cyan' },
        {
            label: 'Cashout requests',
            value: phpMoney(cashouts
                .filter((cashout) => ['requested', 'approved'].includes(cashout.status))
                .reduce((total, cashout) => total + Number(cashout.amount_centavos || 0), 0)),
            icon: Wallet,
            tone: 'cyan'
        }
    ];

    return (
        <div id="affiliate-panel-cashout" role="tabpanel" aria-label="Affiliate cashout" className="affiliate-cashout-scroll-region dgfy-pos-scroll-region flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1 touch-pan-y">
            <div className="grid shrink-0 grid-cols-2 gap-2.5 xl:grid-cols-5 affiliate-kpi-strip affiliate-cashout-kpi-strip">
                {cards.map((card, index) => (
                    <AffiliateStatCard
                        key={card.label}
                        {...card}
                        className={index === cards.length - 1 ? 'affiliate-cashout-requests-kpi' : ''}
                    />
                ))}
            </div>

            <div className="shrink-0">
                <div className="hidden items-center gap-2 sm:flex">
                    <PosSearchField
                        id="affiliate-cashout-search"
                        ariaLabel="Search cashout requests"
                        placeholder="Search cashout requests"
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
                            testId="affiliate-cashout-filter"
                        />
                        <Button type="button" onClick={exportCashouts} className="pos-items-primary-action h-9 rounded-lg bg-[#1A4E8D] px-3 text-[13px] text-white hover:bg-[#143F73] active:bg-[#143F73]">
                            <Download aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Export
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:hidden">
                    <PosSearchField
                        id="affiliate-cashout-search-mobile"
                        ariaLabel="Search cashout requests"
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
                        testId="affiliate-cashout-mobile-filter"
                    />
                    <Button type="button" onClick={exportCashouts} aria-label="Export cashouts" title="Export cashouts" className="affiliate-mobile-toolbar-button">
                        <Download aria-hidden="true" />
                    </Button>
                </div>
            </div>

            <div className="flex min-w-0 shrink-0 flex-col gap-0">
                <PosTableSurface className="flex min-w-0 shrink-0 flex-col">
                    <div data-testid="affiliate-cashout-table-region" className="affiliate-cashout-table-region min-w-0">
                        {isMobileViewport ? (
                            <div data-testid="affiliate-cashout-mobile-records" className="grid min-w-0 gap-2 p-2">
                                {visibleCashouts.map((cashout) => {
                                    const affiliate = getCashoutAffiliate(cashout);
                                    return (
                                        <AffiliateCashoutMobileCard
                                            key={cashout.cashout_id}
                                            cashout={cashout}
                                            affiliate={affiliate}
                                            actionOpen={actionCashoutId === cashout.cashout_id}
                                            onToggleActions={() => setActionCashoutId((current) => current === cashout.cashout_id ? null : cashout.cashout_id)}
                                            detailsOpen={expandedCashoutId === cashout.cashout_id}
                                            onToggleDetails={() => setExpandedCashoutId((current) => current === cashout.cashout_id ? null : cashout.cashout_id)}
                                        />
                                    );
                                })}
                                {visibleCashouts.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-[13px] font-medium text-slate-500">
                                        No cashout requests yet.
                                    </div>
                                )}
                            </div>
                        ) : (
                        <table aria-label="Affiliate cashout table" className="pos-affiliates-data-table pos-affiliates-cashout-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]">
                        <colgroup>
                            {AFFILIATE_CASHOUT_COLUMN_WIDTHS.map((className, index) => <col key={index} className={className} />)}
                        </colgroup>
                        <thead className={POS_TABLE_HEADER_CLASS}>
                            <tr className="h-12">
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Request ID</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Affiliate</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Amount (₱)</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Available (₱)</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Date</th>
                                <th className={AFFILIATE_TABLE_HEADER_CELL_CLASS}>Status</th>
                                <th className={AFFILIATE_TABLE_ACTION_HEADER_CELL_CLASS}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleCashouts.map((cashout) => {
                                const actionOpen = actionCashoutId === cashout.cashout_id;
                                const affiliate = getCashoutAffiliate(cashout);
                                return (
                                        <tr key={cashout.cashout_id} className={POS_TABLE_ROW_CLASS}>
                                            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap font-mono text-slate-500`}>{formatCashoutRequestId(cashout)}</td>
                                            <td className={AFFILIATE_TABLE_CELL_CLASS}>
                                                <div className="font-black text-[#0F172A]">{cashoutAffiliateDisplayName(cashout)}</div>
                                                <div className="mt-0.5 break-words text-[13px] text-slate-400">{affiliate?.dgfyAccount?.email || cashout.enrollment?.dgfyAccount?.email || 'Email unavailable'}</div>
                                            </td>
                                            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap font-semibold`}>{money(cashout.amount_centavos)}</td>
                                            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap font-semibold text-slate-600`}>
                                                {affiliate ? money(affiliate.earnings?.available_centavos) : '—'}
                                            </td>
                                            <td className={`${AFFILIATE_TABLE_CELL_CLASS} whitespace-nowrap text-slate-500`}>{formatAffiliateTableDate(cashout.requested_at)}</td>
                                            <td className={AFFILIATE_TABLE_CELL_CLASS}><AffiliateStatusBadge status={cashout.status} /></td>
                                            <td className={AFFILIATE_TABLE_ACTION_CELL_CLASS}>
                                                <div className="flex w-full items-center justify-center">
                                                    <PosTableActionButton
                                                        icon={MoreVertical}
                                                        aria-label={`Actions for ${cashoutAffiliateDisplayName(cashout)}`}
                                                        aria-expanded={actionOpen}
                                                        onClick={() => setActionCashoutId((current) => current === cashout.cashout_id ? null : cashout.cashout_id)}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                );
                            })}
                            {visibleCashouts.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">No cashout requests yet.</td>
                                </tr>
                            )}
                        </tbody>
                        </table>
                        )}
                    </div>
                </PosTableSurface>
                <GlobalPagination
                    testId="affiliate-cashout-pagination"
                    ariaLabel="Affiliate cashout pagination"
                    currentPage={safeCurrentPage}
                    totalPages={totalPages}
                    totalItems={filteredCashouts.length}
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

            <Dialog
                open={Boolean(activeCashout)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) setActionCashoutId(null);
                }}
            >
                <DialogContent
                    data-testid="affiliate-cashout-actions-dialog"
                    className="affiliate-cashout-dialog flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full"
                >
                    <DialogHeader className="border-b border-slate-100 px-4 py-4 text-left sm:px-5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-[#1b4e8d]">
                                    <WalletCards className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">Cashout actions</DialogTitle>
                                    <DialogDescription className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] leading-4 text-[#64748B]">
                                        <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-[#1b4e8d]">
                                            {payoutMethodLabel(activeCashout?.payout_snapshot)}
                                        </span>
                                        <span aria-hidden="true" className="shrink-0 text-slate-400">•</span>
                                        <span className="truncate">{payoutDestination(activeCashout?.payout_snapshot)}</span>
                                    </DialogDescription>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Close cashout actions dialog"
                                onClick={() => setActionCashoutId(null)}
                                className="h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                                <X aria-hidden="true" className="h-4 w-4" />
                            </Button>
                        </div>
                    </DialogHeader>
                    {activeCashout && (
                        <CashoutActionPanel
                            cashout={activeCashout}
                            canApproveCashouts={canApproveCashouts}
                            canPayCashouts={canPayCashouts}
                            busy={cashoutBusyId === activeCashout.cashout_id}
                            payoutReference={payoutRefDrafts[activeCashout.cashout_id] || ''}
                            onPayoutReferenceChange={(value) => setPayoutRefDrafts((previous) => ({ ...previous, [activeCashout.cashout_id]: value }))}
                            rejectionReason={rejectReasonDrafts[activeCashout.cashout_id] || ''}
                            onRejectionReasonChange={(value) => setRejectReasonDrafts((previous) => ({ ...previous, [activeCashout.cashout_id]: value }))}
                            onApprove={() => onApprove(activeCashout)}
                            onMarkPaid={() => onMarkPaid(activeCashout)}
                            onReject={() => onReject(activeCashout)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

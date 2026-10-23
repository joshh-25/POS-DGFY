import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination } from '@/components/ui/pagination';
import CashierHistoryTable from './CashierHistoryTable.jsx';
import CashierHistoryFilterToolbar from './CashierHistoryFilterToolbar.jsx';
import PosShiftRefreshButton from './PosShiftRefreshButton.jsx';
import PosDropdownSelect from './PosDropdownSelect.jsx';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import { formatPosDateRangeLabel } from './posFilterLabelUtils.js';
import {
    POS_SHIFT_PRIMARY_BUTTON_CLASS,
    POS_SHIFT_SECONDARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';
import { POS_FILTER_TRIGGER_HEIGHT_CLASS } from './posToolbarSizing.js';

const CASHIER_HISTORY_PAGE_SIZE_OPTIONS = [10, 20, 50];

const renderCashierHistoryPageSizeDropdown = ({
    controlId,
    options,
    selectedPageSize,
    disabled,
    onChange,
    hidePageSizeSuffixOnMobile
}) => (
    <PosDropdownSelect
        id={controlId}
        triggerTestId={controlId}
        menuId={`${controlId}-options`}
        ariaLabel="Items per page"
        listboxLabel="Items per page options"
        value={selectedPageSize}
        disabled={disabled}
        className="dgfy-global-pagination__page-size shrink-0"
        triggerClassName="dgfy-global-pagination__page-size-trigger inline-flex h-10 min-w-[5.75rem] items-center justify-between gap-2 rounded-xl border border-[#8AA8CD] bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-[#1A4E8D] hover:bg-[#F8FBFF] focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/15 disabled:cursor-not-allowed disabled:opacity-50 lg:text-[13px]"
        menuClassName="dgfy-global-pagination__page-size-menu absolute bottom-[calc(100%+0.375rem)] left-0 z-50 max-h-72 min-w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
        optionClassName="dgfy-global-pagination__page-size-option"
        valueClassName="dgfy-global-pagination__page-size-value whitespace-nowrap"
        onChange={(nextValue) => onChange(Number(nextValue))}
        options={options.map((option) => ({
            value: option,
            label: (
                <>
                    {option}
                    <span className={`dgfy-global-pagination__page-size-suffix${hidePageSizeSuffixOnMobile ? ' dgfy-global-pagination__page-size-suffix--hide-on-mobile' : ''}`}>
                        {' / page'}
                    </span>
                </>
            ),
            testId: `${controlId}-option-${option}`
        }))}
    />
);

const getManilaDate = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const createTodayFilters = (today) => ({
    rangeMode: 'today',
    dateFrom: today,
    dateTo: today,
    dateFilterApplied: false,
    status: 'all'
});

export default function CashierHistoryPanel({
    state = { loading: false, records: [], pagination: null, errorMessage: '', requestScopeKey: null, recordsScopeKey: null },
    onRefresh = async () => {},
    onViewSummary = () => {},
    activeShift = null,
    locked = false,
    isOnline = true,
    currency = '\u20b1'
}) {
    const today = useMemo(() => getManilaDate(), []);
    const initialFilters = useMemo(() => createTodayFilters(today), [today]);
    const [appliedFilters, setAppliedFilters] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const requestFilters = useMemo(() => ({
        ...appliedFilters,
        search: debouncedSearchQuery
    }), [appliedFilters, debouncedSearchQuery]);
    const storedRecords = Array.isArray(state?.records) ? state.records : [];
    const historyScope = state?.historyScope || state?.history_scope || {};
    const historyScopeMode = String(historyScope?.mode || 'own').trim().toLowerCase();
    const isCompanyScope = historyScopeMode === 'company';
    const isGrantedScope = historyScopeMode === 'granted';
    const historyScopeLabel = String(historyScope?.label || '').trim();
    const scopeHeading = isCompanyScope
        ? 'Cashier History — All Branches'
        : (isGrantedScope ? 'Cashier History — Authorized Branches' : 'Cashier History');
    const scopeDescription = isCompanyScope
        ? `Showing shift summaries across all authorized company branches${historyScope?.location_count ? ` (${historyScope.location_count} branches).` : '.'}`
        : (isGrantedScope
            ? 'Showing shift summaries for the branches assigned to this account.'
            : 'Only your shifts are shown.');
    const loadingCopy = isCompanyScope
        ? 'Loading company cashier summaries...'
        : (isGrantedScope ? 'Loading authorized branch cashier summaries...' : 'Loading your cashier summaries...');
    const activeShiftLabel = String(activeShift?.status || '').toLowerCase() === 'open'
        ? 'Open shift'
        : (isCompanyScope || isGrantedScope ? 'Active shift' : 'Your active shift');
    const cashierName = state?.cashier?.cashier_name
        || state?.cashier?.display_name
        || state?.cashier?.name
        || state?.cashier?.username
        || '';
    const activeShiftId = activeShift?.pos_terminal_shift_id || activeShift?.shift_id || null;
    const activeShiftBusinessDate = String(activeShift?.business_date || '').slice(0, 10);
    const activeShiftLocationId = activeShift?.location_id || activeShift?.location?.location_id || null;
    const buildFilters = useCallback((nextPage = page, nextFilters = requestFilters, nextPageSize = pageSize) => {
        const normalizedSearch = String(nextFilters.search || '').trim();
        return {
            page: nextPage,
            limit: nextPageSize,
            ...(nextFilters.dateFrom ? { date_from: nextFilters.dateFrom } : {}),
            ...(nextFilters.dateTo ? { date_to: nextFilters.dateTo } : {}),
            ...(normalizedSearch ? { search: normalizedSearch } : {}),
            ...(nextFilters.status !== 'all' ? { status: nextFilters.status } : {})
        };
    }, [page, pageSize, requestFilters]);

    const expectedRequestScopeKey = JSON.stringify(buildFilters());
    const hasRecordsScope = Object.prototype.hasOwnProperty.call(state || {}, 'recordsScopeKey');
    const hasRequestScope = Object.prototype.hasOwnProperty.call(state || {}, 'requestScopeKey');
    const recordsMatchCurrentScope = !hasRecordsScope || state.recordsScopeKey === expectedRequestScopeKey;
    const requestMatchesCurrentScope = !hasRequestScope || state.requestScopeKey === expectedRequestScopeKey;
    const records = recordsMatchCurrentScope ? storedRecords : [];
    const pagination = recordsMatchCurrentScope ? (state?.pagination || {}) : {};
    const totalItems = Number(pagination.total || records.length || 0);
    const reportedTotalPages = Number(pagination.totalPages);
    const totalPages = Math.max(1, Number.isFinite(reportedTotalPages) && reportedTotalPages > 0
        ? reportedTotalPages
        : Math.ceil(totalItems / pageSize));
    const firstVisibleItem = records.length > 0 && totalItems > 0 ? ((page - 1) * pageSize) + 1 : 0;
    const lastVisibleItem = records.length > 0
        ? Math.min(firstVisibleItem + records.length - 1, totalItems)
        : 0;
    const currentScopeError = requestMatchesCurrentScope ? state?.errorMessage : '';
    const currentScopeLoading = Boolean(
        !currentScopeError
        && (!recordsMatchCurrentScope || (requestMatchesCurrentScope && state?.loading))
    );
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim());
        }, 300);
        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    const activeShiftIsInRecords = Boolean(
        activeShiftId
        && records.some((record) => String(record?.shift?.pos_terminal_shift_id || record?.shift?.shift_id || '') === String(activeShiftId))
    );

    const refresh = useCallback((nextPage = page, nextFilters = requestFilters, nextPageSize = pageSize) => {
        setPage(nextPage);
        return onRefresh(buildFilters(nextPage, nextFilters, nextPageSize));
    }, [buildFilters, onRefresh, page, pageSize, requestFilters]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refresh(1, requestFilters);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [activeShiftBusinessDate, activeShiftId, activeShiftLocationId, requestFilters]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleQuickRange = (rangeMode) => {
        const nextFilters = {
            ...appliedFilters,
            rangeMode,
            dateFrom: rangeMode === 'today' ? today : '',
            dateTo: rangeMode === 'today' ? today : '',
            dateFilterApplied: rangeMode === 'today'
        };
        setAppliedFilters(nextFilters);
        setPage(1);
    };

    const handleApplyDateRange = ({ dateFrom, dateTo }) => {
        const rangeMode = dateFrom === today && dateTo === today ? 'today' : 'custom';
        setAppliedFilters((current) => ({
            ...current,
            rangeMode,
            dateFrom,
            dateTo,
            dateFilterApplied: true
        }));
        setPage(1);
    };

    const handleApplyStatus = (status) => {
        setAppliedFilters((current) => ({ ...current, status }));
        setPage(1);
    };

    const handleRemoveFilter = (filterKey) => {
        if (filterKey === 'date') {
            setAppliedFilters((current) => ({
                ...current,
                rangeMode: 'today',
                dateFrom: today,
                dateTo: today,
                dateFilterApplied: false
            }));
        } else if (filterKey === 'status') {
            setAppliedFilters((current) => ({ ...current, status: 'all' }));
        }
        setPage(1);
    };

    const handleClearAllFilters = () => {
        setAppliedFilters(createTodayFilters(today));
        setSearchQuery('');
        setDebouncedSearchQuery('');
        setPage(1);
    };

    const handleViewAllRecords = () => {
        const nextFilters = {
            rangeMode: 'all',
            dateFrom: '',
            dateTo: '',
            dateFilterApplied: false,
            status: 'all'
        };
        setAppliedFilters(nextFilters);
        setPage(1);
    };

    const activeFilterChips = useMemo(() => ([
        ...(appliedFilters.dateFilterApplied ? [{
            key: 'date',
            label: `Date: ${formatPosDateRangeLabel(appliedFilters.dateFrom, appliedFilters.dateTo)}`
        }] : []),
        ...(appliedFilters.status !== 'all' ? [{
            key: 'status',
            label: `Status: ${appliedFilters.status === 'open' ? 'Open' : 'Closed'}`
        }] : [])
    ]), [appliedFilters]);
    const refreshAction = (
        <PosShiftRefreshButton
            label="Refresh cashier history"
            onClick={() => void refresh(page, requestFilters)}
            disabled={state?.loading || !isOnline}
            loading={state?.loading}
            heightClassName={POS_FILTER_TRIGGER_HEIGHT_CLASS}
        />
    );

    return (
        <div className="min-w-0 space-y-4" aria-busy={state?.loading || undefined}>
            <div>
                <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-[#1A4E8D]" />
                    <h3 className="text-base font-black text-[#0F172A]">{scopeHeading}</h3>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                    {scopeDescription}
                </p>
            </div>

            <CashierHistoryFilterToolbar
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                status={appliedFilters.status}
                onApplyStatus={handleApplyStatus}
                dateRange={{
                    dateFrom: appliedFilters.dateFrom || today,
                    dateTo: appliedFilters.dateTo || today
                }}
                todayDate={today}
                activeFilterChips={activeFilterChips}
                onRemoveFilter={handleRemoveFilter}
                onClearAllFilters={handleClearAllFilters}
                onApplyDateRange={handleApplyDateRange}
                cashierName={cashierName}
                actionDisabled={locked || !isOnline}
                refreshAction={refreshAction}
            />

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                <Button
                    type="button"
                    variant={appliedFilters.rangeMode === 'today' ? 'default' : 'outline'}
                    className={`h-9 rounded-lg px-3 text-xs font-extrabold ${appliedFilters.rangeMode === 'today' ? POS_SHIFT_PRIMARY_BUTTON_CLASS : POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                    onClick={() => handleQuickRange('today')}
                    aria-pressed={appliedFilters.rangeMode === 'today'}
                >
                    <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                    Today
                </Button>
                <Button
                    type="button"
                    variant={appliedFilters.rangeMode === 'all' ? 'default' : 'outline'}
                    className={`h-9 rounded-lg px-3 text-xs font-extrabold ${appliedFilters.rangeMode === 'all' ? POS_SHIFT_PRIMARY_BUTTON_CLASS : POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                    onClick={() => handleQuickRange('all')}
                    aria-pressed={appliedFilters.rangeMode === 'all'}
                >
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    All records
                </Button>
                <span className="text-xs text-slate-500">
                    {historyScopeLabel || (state?.cashier?.cashier_name ? `Cashier: ${state.cashier.cashier_name}` : 'Current cashier')}
                </span>
            </div>

            {state?.errorMessage ? (
                currentScopeError ? (
                <PosShiftStateNotice
                    variant="error"
                    title={records.length > 0 ? 'Refresh failed — showing last results' : ''}
                    message={currentScopeError}
                    compact
                />
                ) : null
            ) : null}

            {currentScopeLoading && records.length === 0 ? (
                <PosShiftStateNotice variant="loading" message={loadingCopy} />
            ) : !currentScopeError && !currentScopeLoading && records.length === 0 ? (
                activeShift && !activeShiftIsInRecords && !debouncedSearchQuery ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900" role="status">
                        <p className="font-bold">
                            {activeShiftLabel} #{activeShiftId || '-'} isn’t included in these results.
                        </p>
                        <p className="mt-1 text-blue-800">
                            Adjust filters or view all records. Business date: {activeShiftBusinessDate || 'unchanged'}.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            className={`mt-3 h-9 rounded-lg px-3 text-xs font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                            onClick={handleViewAllRecords}
                            disabled={locked || !isOnline}
                        >
                            View All records
                        </Button>
                    </div>
                ) : (
                    <PosShiftStateNotice
                        variant="empty"
                        message={debouncedSearchQuery
                            ? 'No shifts match this search and the selected filters.'
                            : 'No cashier shift records match these filters.'}
                    />
                )
            ) : records.length > 0 ? (
                <CashierHistoryTable
                    records={records}
                    cashierName={cashierName}
                    currency={currency}
                    locked={locked}
                    onViewSummary={onViewSummary}
                />
            ) : null}

            {records.length > 0 && totalPages > 1 ? (
                <GlobalPagination
                    testId="pos-cashier-history-pagination"
                    ariaLabel="Cashier history pagination"
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={pageSize}
                    pageSizeOptions={CASHIER_HISTORY_PAGE_SIZE_OPTIONS}
                    renderPageSizeDropdown={renderCashierHistoryPageSizeDropdown}
                    itemLabel="records"
                    loading={state?.loading}
                    disabled={!isOnline}
                    onPageChange={(nextPage) => void refresh(nextPage, requestFilters)}
                    onPageSizeChange={(nextPageSize) => {
                        setPageSize(nextPageSize);
                        void refresh(1, requestFilters, nextPageSize);
                    }}
                    className="border-0 border-t border-slate-100 px-0 shadow-none"
                />
            ) : records.length > 0 && totalItems > 0 ? (
                <p className="border-t border-slate-100 py-3 text-xs text-slate-500">
                    Showing {firstVisibleItem}–{lastVisibleItem} of {totalItems} records
                </p>
            ) : null}
        </div>
    );
}

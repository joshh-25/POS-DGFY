import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAuditLogs } from '../services/auditService.js';
import { formatPosDateRangeLabel } from './posFilterLabelUtils.js';

export const AUDIT_PAGE_SIZE_OPTIONS = [25, 50, 100];

const EMPTY_AUDIT_LOGS = [];

const normalizeAuditFilters = (filters = {}) => ({
    search: String(filters.search || ''),
    dateFrom: String(filters.dateFrom || ''),
    dateTo: String(filters.dateTo || '')
});

export default function useAuditWorkspace({ locked = false, isOnline = true, canViewAudit = false, auditScrollRegionRef }) {
    const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '' });
    const [appliedFilters, setAppliedFilters] = useState(filters);
    const [data, setData] = useState({ logs: [], pagination: { page: 1, limit: 25, total: 0, total_pages: 1 } });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [expandedRowKey, setExpandedRowKey] = useState(null);
    const [copiedLogId, setCopiedLogId] = useState(null);
    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const pendingAuditScrollRowKeyRef = useRef(null);
    const searchTimerRef = useRef(null);

    const loadAudit = useCallback(async () => {
        if (!canViewAudit || locked || !isOnline) return;
        setLoading(true);
        setErrorMessage('');
        try {
            const search = String(appliedFilters.search || '').trim();
            const result = await fetchAuditLogs({
                page,
                limit: pageSize,
                ...(search ? { search } : {}),
                ...(appliedFilters.dateFrom ? { date_from: appliedFilters.dateFrom } : {}),
                ...(appliedFilters.dateTo ? { date_to: appliedFilters.dateTo } : {})
            });
            setData(result);
        } catch (error) {
            setErrorMessage(error?.response?.data?.message || error?.message || 'Unable to load audit history.');
        } finally {
            setLoading(false);
        }
    }, [appliedFilters, canViewAudit, isOnline, locked, page, pageSize]);

    useEffect(() => {
        loadAudit();
    }, [loadAudit]);

    useEffect(() => () => {
        if (searchTimerRef.current && typeof window !== 'undefined') window.clearTimeout(searchTimerRef.current);
    }, []);

    const pagination = data?.pagination || {};
    const logs = Array.isArray(data?.logs) ? data.logs : EMPTY_AUDIT_LOGS;
    const totalPages = Math.max(1, Number(pagination.total_pages || 1));
    const totalItems = Math.max(0, Number(pagination.total || logs.length || 0));

    useEffect(() => {
        setExpandedRowKey(null);
        pendingAuditScrollRowKeyRef.current = null;
        setCopiedLogId(null);
    }, [data, logs]);

    const toggleAuditRow = useCallback((rowKey) => {
        setExpandedRowKey((current) => {
            const nextRowKey = current === rowKey ? null : rowKey;
            pendingAuditScrollRowKeyRef.current = nextRowKey === null ? null : rowKey;
            return nextRowKey;
        });
    }, []);

    useEffect(() => {
        const targetRowKey = pendingAuditScrollRowKeyRef.current;
        if (targetRowKey === null || expandedRowKey !== targetRowKey) return undefined;

        pendingAuditScrollRowKeyRef.current = null;
        const scrollSelectedRowToTop = () => {
            if (typeof document === 'undefined') return;

            const scrollRegion = auditScrollRegionRef.current;
            if (!scrollRegion) return;

            const desktopRow = document.getElementById(`pos-audit-row-${targetRowKey}`);
            const mobileDetails = document.getElementById(`pos-audit-details-mobile-${targetRowKey}`);
            const mobileCard = mobileDetails?.closest('article');
            const target = desktopRow?.getClientRects?.().length ? desktopRow : mobileCard;
            if (!target) return;

            const regionRect = scrollRegion.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const tableHeader = target.closest('table')?.querySelector('thead');
            const stickyHeaderHeight = tableHeader?.getClientRects?.().length
                ? tableHeader.getBoundingClientRect().height
                : 0;
            const targetTop = Math.max(
                0,
                scrollRegion.scrollTop + targetRect.top - regionRect.top - stickyHeaderHeight
            );

            if (typeof scrollRegion.scrollTo === 'function') {
                scrollRegion.scrollTo({ top: targetTop, behavior: 'auto' });
            } else {
                scrollRegion.scrollTop = targetTop;
            }
        };

        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            const frameId = window.requestAnimationFrame(scrollSelectedRowToTop);
            return () => window.cancelAnimationFrame?.(frameId);
        }

        scrollSelectedRowToTop();
        return undefined;
    }, [auditScrollRegionRef, expandedRowKey]);

    const applySearch = useCallback((value) => {
        setPage(1);
        setAppliedFilters((current) => ({ ...current, search: value }));
    }, []);

    const handleSearchChange = useCallback((event) => {
        const value = event.target.value;
        setFilters((current) => ({ ...current, search: value }));
        if (searchTimerRef.current && typeof window !== 'undefined') window.clearTimeout(searchTimerRef.current);
        if (typeof window !== 'undefined') {
            searchTimerRef.current = window.setTimeout(() => applySearch(value), 350);
        }
    }, [applySearch]);

    const clearSearch = useCallback(() => {
        if (searchTimerRef.current && typeof window !== 'undefined') window.clearTimeout(searchTimerRef.current);
        setFilters((current) => ({ ...current, search: '' }));
        applySearch('');
    }, [applySearch]);

    const submitSearch = useCallback((event) => {
        event.preventDefault();
        if (searchTimerRef.current && typeof window !== 'undefined') window.clearTimeout(searchTimerRef.current);
        applySearch(filters.search);
    }, [applySearch, filters.search]);

    const copyAuditPayload = useCallback(async (payload, rowKey) => {
        if (!payload) return;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(payload);
            } else if (typeof document !== 'undefined') {
                const textarea = document.createElement('textarea');
                textarea.value = payload;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            } else {
                return;
            }
            setCopiedLogId(rowKey);
            if (typeof window !== 'undefined') {
                window.setTimeout(() => setCopiedLogId((current) => (current === rowKey ? null : current)), 1800);
            }
        } catch {
            setErrorMessage('Unable to copy the audit payload.');
        }
    }, []);

    const applyDateFilter = useCallback(({ dateFrom = '', dateTo = '' } = {}) => {
        const normalizedDateFrom = String(dateFrom || '').trim();
        const normalizedDateTo = String(dateTo || normalizedDateFrom).trim();
        setFilters((current) => normalizeAuditFilters({ ...current, dateFrom: normalizedDateFrom, dateTo: normalizedDateTo }));
        setPage(1);
        setAppliedFilters((current) => ({ ...current, dateFrom: normalizedDateFrom, dateTo: normalizedDateTo }));
        setDateFilterOpen(false);
    }, []);

    const removeDateFilter = useCallback(() => applyDateFilter({ dateFrom: '', dateTo: '' }), [applyDateFilter]);
    const activeDateFilter = appliedFilters.dateFrom || appliedFilters.dateTo;
    const activeFilters = activeDateFilter
        ? [{ key: 'date', label: `Date: ${formatPosDateRangeLabel(appliedFilters.dateFrom, appliedFilters.dateTo)}` }]
        : [];

    return {
        filters,
        appliedFilters,
        logs,
        page,
        pageSize,
        loading,
        errorMessage,
        expandedRowKey,
        copiedLogId,
        dateFilterOpen,
        totalPages,
        totalItems,
        activeDateFilter,
        activeFilters,
        loadAudit,
        setFilters,
        setPage,
        setPageSize,
        setDateFilterOpen,
        handleSearchChange,
        clearSearch,
        submitSearch,
        copyAuditPayload,
        toggleAuditRow,
        applyDateFilter,
        removeDateFilter
    };
}

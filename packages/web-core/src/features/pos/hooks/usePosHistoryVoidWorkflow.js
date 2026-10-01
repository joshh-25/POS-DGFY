import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
    fetchPosTransactionById,
    fetchPosTransactions,
    fetchPosVoidApprovals,
    decidePosVoidApproval,
    recordExternalPosTransactionRefund,
    refundCashPosTransaction,
    refundProviderPosTransaction,
    reversePosSplitAllocation,
    voidPosTransaction
} from '../services/posService';
import {
    buildMissingFieldsMessage,
    buildOfflineCheckoutHistoryRow,
    inferReceiptContract,
    rowMatchesHistoryFilters,
    toArray
} from '../utils/posCheckoutTerminalUtils.js';
import {
    buildPosHistoryQuery,
    DEFAULT_POS_HISTORY_PAGE_SIZE,
    normalizePosHistoryPageSize
} from '../utils/posHistoryQuery.js';
import { isCheckoutQueueEntry } from '../utils/posCheckoutTerminalQueue.js';

const isParkedSaleCancellationApproval = (approvalRequest) => (
    approvalRequest?.action_type === 'pos_parked_sale_cancel'
);

/**
 * Owns POS transaction-history reads, filters, offline-history projection,
 * receipt lookup, and the administrator/cashier void command. The terminal
 * remains the compatibility boundary for the history panel and receipt UI.
 */
export const usePosHistoryVoidWorkflow = ({
    sessionLocked = false,
    canViewHistory = true,
    canVoidTransactions = false,
    isAdminOperator = false,
    isCashierRole = false,
    activeShiftId = null,
    selectedLocationId = null,
    normalizedTerminalId = '',
    currentViewMode = 'checkout',
    setCurrentViewMode = () => {},
    queuedCheckouts = [],
    setLastReceipt = () => {},
    setLastReceiptContract = () => {},
    setReceiptPreviewSource = () => {},
    setReceiptPreviewModalOpen = () => {},
    setExternalReceiptModalActive = () => {},
    externalReceiptTransactionId = null,
    onExternalReceiptHydrated = null,
    externalHistoryQuery = '',
    onExternalHistoryHydrated = null,
    onFinancialMutationCompleted = null,
    inlineVoidApprovalEnabled = false,
    canReviewVoidApprovals = false
} = {}) => {
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyPagination, setHistoryPagination] = useState(null);
    const [historyPageSize, setHistoryPageSizeState] = useState(DEFAULT_POS_HISTORY_PAGE_SIZE);
    const [historySearch, setHistorySearch] = useState('');
    const [historyStatus, setHistoryStatus] = useState('all');
    const [historyPaymentType, setHistoryPaymentType] = useState('all');
    const [historyOrderMethod, setHistoryOrderMethod] = useState('all');
    const [historyOrderSource, setHistoryOrderSource] = useState('all');
    const [historyCashierName, setHistoryCashierName] = useState('');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const historyRequestSequenceRef = useRef(0);
    const historyAutoLoadTimeoutRef = useRef(null);
    const historyPageSizeRef = useRef(DEFAULT_POS_HISTORY_PAGE_SIZE);
    const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
    const [voidingTransactionId, setVoidingTransactionId] = useState(null);
    const [voidApprovalQueue, setVoidApprovalQueue] = useState([]);
    const [voidApprovalQueueLoading, setVoidApprovalQueueLoading] = useState(false);
    const [voidApprovalQueueError, setVoidApprovalQueueError] = useState('');
    const [voidApprovalDialogOpen, setVoidApprovalDialogOpen] = useState(false);
    const [voidApprovalSelectedRequest, setVoidApprovalSelectedRequest] = useState(null);
    const [voidApprovalDecisionLoading, setVoidApprovalDecisionLoading] = useState(false);
    const [refundWorkflowTransaction, setRefundWorkflowTransaction] = useState(null);
    const [refundWorkflowLoading, setRefundWorkflowLoading] = useState(false);
    const [refundWorkflowSubmitting, setRefundWorkflowSubmitting] = useState(false);

    const safeHistoryRows = toArray(historyRows);
    const safeQueuedCheckouts = toArray(queuedCheckouts);
    const offlineHistoryRows = useMemo(() => (
        safeQueuedCheckouts
            .filter((entry) => isCheckoutQueueEntry(entry))
            .map((entry) => {
                const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : {};
                if (payload?.offline_history_snapshot && typeof payload.offline_history_snapshot === 'object') {
                    return payload.offline_history_snapshot;
                }
                return buildOfflineCheckoutHistoryRow({
                    payload,
                    queuedAt: entry?.queued_at,
                    cartSubtotal: Number(payload?.offline_totals?.cartSubtotal || 0),
                    calculatedDiscountAmount: Number(payload?.offline_totals?.calculatedDiscountAmount || 0),
                    serviceFeeAmount: Number(payload?.offline_totals?.serviceFeeAmount || 0),
                    restaurantServiceChargeAmount: Number(payload?.offline_totals?.restaurantServiceChargeAmount || 0),
                    vatBreakdown: payload?.offline_totals?.vatBreakdown || {},
                    cartTotal: Number(payload?.offline_totals?.cartTotal || 0),
                    selectedDiscount: payload?.offline_discount_snapshot || null,
                    manualDiscountRate: Number(payload?.offline_totals?.manualDiscountRate || 0),
                    manualDiscountMode: payload?.offline_totals?.manualDiscountMode || payload?.discount_mode || 'none'
                });
            })
            .filter(Boolean)
            .filter((row) => rowMatchesHistoryFilters(row, {
                historySearch,
                historyStatus,
                historyPaymentType,
                historyOrderMethod,
                historyOrderSource,
                historyCashierName,
                historyDateFrom,
                historyDateTo
            }))
            .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    ), [
        historyCashierName,
        historyDateFrom,
        historyDateTo,
        historyOrderMethod,
        historyOrderSource,
        historyPaymentType,
        historySearch,
        historyStatus,
        safeQueuedCheckouts
    ]);
    const visibleHistoryRows = useMemo(() => (
        historyPage === 1
            ? [...offlineHistoryRows, ...safeHistoryRows]
            : safeHistoryRows
    ), [historyPage, offlineHistoryRows, safeHistoryRows]);
    const visibleHistoryPagination = useMemo(() => {
        const baseLimit = Number(historyPagination?.limit || historyPageSize || safeHistoryRows.length || DEFAULT_POS_HISTORY_PAGE_SIZE)
            || DEFAULT_POS_HISTORY_PAGE_SIZE;
        const baseTotal = Number(historyPagination?.total || safeHistoryRows.length || 0);
        const offlineCount = historyPage === 1 ? offlineHistoryRows.length : 0;
        const total = baseTotal + offlineCount;
        return {
            ...(historyPagination || {}),
            page: historyPage,
            limit: baseLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / baseLimit))
        };
    }, [historyPage, historyPageSize, historyPagination, offlineHistoryRows.length, safeHistoryRows.length]);

    const setHistoryPageSize = useCallback((value) => {
        const nextPageSize = normalizePosHistoryPageSize(value);
        historyPageSizeRef.current = nextPageSize;
        setHistoryPageSizeState(nextPageSize);
        return nextPageSize;
    }, []);

    const loadHistory = useCallback(async (page = 1, requestedPageSize = historyPageSizeRef.current) => {
        const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
        const limit = setHistoryPageSize(requestedPageSize);
        if (historyAutoLoadTimeoutRef.current !== null) {
            window.clearTimeout(historyAutoLoadTimeoutRef.current);
            historyAutoLoadTimeoutRef.current = null;
        }
        const requestSequence = historyRequestSequenceRef.current + 1;
        historyRequestSequenceRef.current = requestSequence;
        const isCurrentRequest = () => historyRequestSequenceRef.current === requestSequence;

        if (sessionLocked || !canViewHistory) {
            setHistoryRows([]);
            setHistoryPagination(null);
            setHistoryLoading(false);
            return;
        }
        setHistoryLoading(true);
        try {
            const historyQuery = buildPosHistoryQuery({
                historyStatus,
                page: normalizedPage,
                limit,
                search: historySearch || undefined,
                paymentType: historyPaymentType === 'all' ? undefined : historyPaymentType,
                orderMethod: historyOrderMethod === 'all' ? undefined : historyOrderMethod,
                orderSource: historyOrderSource === 'all' ? undefined : historyOrderSource,
                cashierName: historyCashierName || undefined,
                dateFrom: historyDateFrom || undefined,
                dateTo: historyDateTo || undefined,
                locationId: selectedLocationId || undefined
            });
            if (!historyQuery) {
                if (!isCurrentRequest()) return;
                setHistoryRows([]);
                setHistoryPagination({ page: normalizedPage, limit, total: 0, totalPages: 1 });
                setHistoryPage(normalizedPage);
                return;
            }
            const result = await fetchPosTransactions(historyQuery);
            if (!isCurrentRequest()) return;
            const rows = Array.isArray(result?.transactions) ? result.transactions : [];
            setHistoryRows(rows);
            setHistoryPagination(result?.pagination || null);
            setHistoryPage(normalizedPage);
        } catch (error) {
            if (!isCurrentRequest()) return;
            if (!error?.response) {
                setHistoryRows([]);
                setHistoryPagination({ page: normalizedPage, limit, total: 0, totalPages: 1 });
                setHistoryPage(normalizedPage);
            }
            toast.error(error?.response?.data?.message || 'Failed to load POS transaction history');
        } finally {
            if (isCurrentRequest()) setHistoryLoading(false);
        }
    }, [
        canViewHistory,
        historyCashierName,
        historyDateFrom,
        historyDateTo,
        historyOrderMethod,
        historyOrderSource,
        historyPaymentType,
        historySearch,
        historyStatus,
        selectedLocationId,
        sessionLocked,
        setHistoryPageSize
    ]);

    const openHistoryDetail = useCallback(async (historyRowOrId, { switchToReceipt = false, openModal = true } = {}) => {
        setHistoryDetailLoading(true);
        setLastReceipt(null);
        setLastReceiptContract(null);
        setExternalReceiptModalActive(false);
        if (switchToReceipt) {
            setCurrentViewMode('receipt');
            setReceiptPreviewModalOpen(false);
        } else if (openModal) {
            setReceiptPreviewSource('receipt_preview');
            setReceiptPreviewModalOpen(true);
        }

        try {
            const historyRow = historyRowOrId && typeof historyRowOrId === 'object' ? historyRowOrId : null;
            const posTransactionId = historyRow?.pos_transaction_id ?? historyRowOrId;
            if (historyRow?.offline_sync_state === 'pending_sync') {
                setLastReceipt(historyRow);
                setLastReceiptContract(inferReceiptContract(historyRow));
                return;
            }
            const detail = await fetchPosTransactionById(posTransactionId, {
                location_id: selectedLocationId || undefined
            });
            setLastReceipt(detail || null);
            setLastReceiptContract(inferReceiptContract(detail));
        } catch (error) {
            toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || 'Failed to load selected transaction');
        } finally {
            setHistoryDetailLoading(false);
        }
    }, [selectedLocationId, setCurrentViewMode, setExternalReceiptModalActive, setLastReceipt, setLastReceiptContract, setReceiptPreviewModalOpen, setReceiptPreviewSource]);

    const loadVoidApprovalQueue = useCallback(async () => {
        if (!inlineVoidApprovalEnabled || sessionLocked || !canReviewVoidApprovals) {
            setVoidApprovalQueue([]);
            setVoidApprovalQueueLoading(false);
            return [];
        }

        setVoidApprovalQueueLoading(true);
        setVoidApprovalQueueError('');
        try {
            const result = await fetchPosVoidApprovals({ status: 'pending', limit: 100 });
            const approvals = Array.isArray(result?.approvals) ? result.approvals : [];
            setVoidApprovalQueue(approvals);
            return approvals;
        } catch (error) {
            const status = error?.response?.status;
            const message = status === 401 || status === 403
                ? 'You are not authorized to review POS approval requests.'
                : (error?.response?.data?.message || 'Failed to load pending POS approval requests.');
            setVoidApprovalQueueError(message);
            setVoidApprovalQueue([]);
            return [];
        } finally {
            setVoidApprovalQueueLoading(false);
        }
    }, [canReviewVoidApprovals, inlineVoidApprovalEnabled, sessionLocked]);

    const openVoidApprovalQueue = useCallback(async () => {
        if (!inlineVoidApprovalEnabled) return;
        setVoidApprovalDialogOpen(true);
        await loadVoidApprovalQueue();
    }, [inlineVoidApprovalEnabled, loadVoidApprovalQueue]);

    const closeVoidApprovalQueue = useCallback(() => {
        if (voidApprovalDecisionLoading) return;
        setVoidApprovalDialogOpen(false);
        setVoidApprovalSelectedRequest(null);
        setVoidApprovalQueueError('');
    }, [voidApprovalDecisionLoading]);

    const handleVoidHistoryTransaction = useCallback(async (historyRow, reason) => {
        const posTransactionId = Number(historyRow?.pos_transaction_id);
        if (!Number.isInteger(posTransactionId) || posTransactionId <= 0) {
            toast.error('Invalid POS transaction reference.');
            return;
        }
        if (!canVoidTransactions) {
            toast.error('You do not have permission to void POS transactions.');
            return;
        }
        if (!activeShiftId && !isAdminOperator) {
            toast.error('Open a shift before voiding a POS transaction.');
            return;
        }

        setVoidingTransactionId(posTransactionId);
        try {
            const voidPayload = {
                reason,
                terminal_id: normalizedTerminalId || undefined
            };
            if (activeShiftId) voidPayload.shift_id = activeShiftId;
            const voidResult = await voidPosTransaction(posTransactionId, voidPayload);
            const approvalPending = voidResult?.pending === true;
            toast.success(approvalPending
                ? 'Void request submitted. The sale and stock stay unchanged until manager approval.'
                : 'POS transaction voided.');
            await loadHistory(historyPage);
            if (approvalPending && inlineVoidApprovalEnabled) {
                setVoidApprovalSelectedRequest(voidResult?.approval_request || null);
                setVoidApprovalDialogOpen(true);
                if (canReviewVoidApprovals) void loadVoidApprovalQueue();
            }
            if (!approvalPending && typeof onFinancialMutationCompleted === 'function') {
                try {
                    await onFinancialMutationCompleted({ ...historyRow, ...(voidResult?.transaction || {}) });
                } catch {
                    toast.warning('The transaction was voided, but shift totals could not refresh automatically.');
                }
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to void POS transaction.');
            throw error;
        } finally {
            setVoidingTransactionId(null);
        }
    }, [activeShiftId, canReviewVoidApprovals, canVoidTransactions, historyPage, inlineVoidApprovalEnabled, isAdminOperator, loadHistory, loadVoidApprovalQueue, normalizedTerminalId, onFinancialMutationCompleted]);

    const decideVoidApproval = useCallback(async (approvalRequest, decision, note = '') => {
        const approvalRequestId = Number(approvalRequest?.business_admin_approval_request_id || approvalRequest?.id);
        const normalizedDecision = String(decision || '').trim().toLowerCase();
        if (!Number.isInteger(approvalRequestId) || approvalRequestId <= 0 || !['approve', 'reject'].includes(normalizedDecision)) {
            const error = new Error('A valid POS approval request and decision are required.');
            setVoidApprovalQueueError(error.message);
            throw error;
        }

        setVoidApprovalDecisionLoading(true);
        setVoidApprovalQueueError('');
        try {
            const parkedSaleCancellation = isParkedSaleCancellationApproval(approvalRequest);
            const result = await decidePosVoidApproval(approvalRequestId, normalizedDecision, {
                note: String(note || '').trim().slice(0, 500) || undefined
            });
            const resolvedRequest = result?.approval_request || {
                ...approvalRequest,
                status: normalizedDecision === 'approve' ? 'executed' : 'rejected'
            };
            setVoidApprovalSelectedRequest(resolvedRequest);
            await loadHistory(historyPage);

            if (normalizedDecision === 'approve'
                && !parkedSaleCancellation
                && typeof onFinancialMutationCompleted === 'function') {
                try {
                    const refreshed = await fetchPosTransactionById(approvalRequest.entity_id || approvalRequest.payload?.transaction_id, {
                        location_id: selectedLocationId || undefined
                    });
                    await onFinancialMutationCompleted({
                        ...(approvalRequest.payload || {}),
                        ...(refreshed || {})
                    });
                } catch {
                    toast.warning('The void was approved, but POS totals could not refresh automatically.');
                }
            }

            await loadVoidApprovalQueue();
            toast.success(normalizedDecision === 'approve'
                ? parkedSaleCancellation ? 'Parked sale cancellation approved and executed.' : 'POS void approved and executed.'
                : parkedSaleCancellation ? 'Parked sale cancellation request rejected.' : 'POS void request rejected.');
            return result;
        } catch (error) {
            const status = error?.response?.status;
            const message = status === 401 || status === 403
                ? 'You are not authorized to decide this POS approval request.'
                : (error?.response?.data?.message || error?.message || 'Failed to record the POS approval decision.');
            setVoidApprovalQueueError(message);
            toast.error(message);
            throw error;
        } finally {
            setVoidApprovalDecisionLoading(false);
        }
    }, [historyPage, loadHistory, loadVoidApprovalQueue, onFinancialMutationCompleted, selectedLocationId]);

    const openHistoryRefundWorkflow = useCallback(async (historyRow) => {
        const posTransactionId = Number(historyRow?.pos_transaction_id);
        if (!Number.isInteger(posTransactionId) || posTransactionId <= 0) {
            toast.error('Invalid POS transaction reference.');
            return;
        }
        if (!canVoidTransactions) {
            toast.error('You do not have permission to manage this refund.');
            return;
        }

        setRefundWorkflowLoading(true);
        setRefundWorkflowTransaction({ ...historyRow, pos_transaction_id: posTransactionId });
        try {
            const detail = await fetchPosTransactionById(posTransactionId, {
                location_id: selectedLocationId || undefined
            });
            setRefundWorkflowTransaction(detail || null);
        } catch (error) {
            setRefundWorkflowTransaction(null);
            toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || 'Failed to load refund requirements.');
        } finally {
            setRefundWorkflowLoading(false);
        }
    }, [canVoidTransactions, selectedLocationId]);

    const closeHistoryRefundWorkflow = useCallback(() => {
        if (refundWorkflowSubmitting) return;
        setRefundWorkflowTransaction(null);
    }, [refundWorkflowSubmitting]);

    const submitHistoryRefundWorkflow = useCallback(async ({
        workflow,
        reason,
        externalReference = '',
        completionConfirmed = false,
        allocationId = null,
        amount = null
    } = {}) => {
        const transactionId = Number(refundWorkflowTransaction?.pos_transaction_id);
        if (!Number.isInteger(transactionId) || transactionId <= 0) return;
        const idempotencyKey = `pos-refund-${transactionId}-${Date.now()}`;
        const commonPayload = {
            idempotency_key: idempotencyKey,
            reason,
            terminal_id: normalizedTerminalId || undefined,
            shift_id: activeShiftId || undefined
        };

        setRefundWorkflowSubmitting(true);
        try {
            if (workflow === 'cash') {
                if (!activeShiftId) throw new Error('Open a cashier shift before returning cash.');
                await refundCashPosTransaction(transactionId, commonPayload);
            } else if (workflow === 'external') {
                await recordExternalPosTransactionRefund(transactionId, {
                    ...commonPayload,
                    external_reference: externalReference,
                    completion_confirmed: Boolean(completionConfirmed)
                });
            } else if (workflow === 'provider') {
                await refundProviderPosTransaction(transactionId, {
                    ...commonPayload,
                    provider_reason: 'others'
                });
            } else if (workflow === 'split') {
                await reversePosSplitAllocation(transactionId, allocationId, {
                    ...commonPayload,
                    amount: amount || undefined,
                    external_reference: externalReference || undefined,
                    completion_confirmed: Boolean(completionConfirmed)
                });
            } else {
                throw new Error('This transaction requires manual review; no automatic refund action is authorized.');
            }

            const refreshed = await fetchPosTransactionById(transactionId, {
                location_id: selectedLocationId || undefined
            });
            setRefundWorkflowTransaction(refreshed || null);
            await loadHistory(historyPage);
            toast.success('Refund evidence recorded.');
        } catch (error) {
            toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || error?.message || 'Failed to record refund evidence.');
            throw error;
        } finally {
            setRefundWorkflowSubmitting(false);
        }
    }, [activeShiftId, historyPage, loadHistory, normalizedTerminalId, refundWorkflowTransaction, selectedLocationId]);

    const openInPosReport = useCallback(() => {
        setCurrentViewMode(isCashierRole ? 'history' : 'reports');
    }, [isCashierRole, setCurrentViewMode]);

    useEffect(() => {
        if (sessionLocked) return;
        const id = Number(externalReceiptTransactionId);
        if (!Number.isInteger(id) || id <= 0) return;

        let cancelled = false;
        const loadExternalReceipt = async () => {
            setHistoryDetailLoading(true);
            try {
                const detail = await fetchPosTransactionById(id, {
                    location_id: selectedLocationId || undefined
                });
                if (cancelled) return;
                setLastReceipt(detail || null);
                setLastReceiptContract(inferReceiptContract(detail));
                setExternalReceiptModalActive(true);
                setReceiptPreviewSource('receipt_preview');
                setReceiptPreviewModalOpen(true);
            } catch (error) {
                if (!cancelled) {
                    toast.error(buildMissingFieldsMessage(error) || error?.response?.data?.message || 'Failed to load selected transaction');
                }
            } finally {
                if (!cancelled) {
                    setHistoryDetailLoading(false);
                    if (typeof onExternalReceiptHydrated === 'function') onExternalReceiptHydrated();
                }
            }
        };
        loadExternalReceipt();

        return () => {
            cancelled = true;
        };
    }, [externalReceiptTransactionId, onExternalReceiptHydrated, selectedLocationId, sessionLocked, setExternalReceiptModalActive, setLastReceipt, setLastReceiptContract, setReceiptPreviewModalOpen, setReceiptPreviewSource]);

    useEffect(() => {
        if (sessionLocked) return;
        const query = String(externalHistoryQuery || '').trim();
        if (!query) return;
        setHistorySearch(query);
        setCurrentViewMode('history');
        if (typeof onExternalHistoryHydrated === 'function') onExternalHistoryHydrated();
    }, [externalHistoryQuery, onExternalHistoryHydrated, sessionLocked, setCurrentViewMode]);

    useEffect(() => {
        if (sessionLocked || currentViewMode !== 'history') return undefined;
        const delay = historySearch.trim() ? 300 : 0;
        const timeout = window.setTimeout(() => {
            historyAutoLoadTimeoutRef.current = null;
            loadHistory(1);
        }, delay);
        historyAutoLoadTimeoutRef.current = timeout;
        return () => {
            window.clearTimeout(timeout);
            if (historyAutoLoadTimeoutRef.current === timeout) historyAutoLoadTimeoutRef.current = null;
            historyRequestSequenceRef.current += 1;
        };
    }, [currentViewMode, historySearch, loadHistory, sessionLocked]);

    useEffect(() => {
        if (!canViewHistory && currentViewMode === 'history') setCurrentViewMode('checkout');
    }, [canViewHistory, currentViewMode, setCurrentViewMode]);

    useEffect(() => {
        if (!inlineVoidApprovalEnabled || !canReviewVoidApprovals || sessionLocked || currentViewMode !== 'history') return;
        void loadVoidApprovalQueue();
    }, [canReviewVoidApprovals, currentViewMode, inlineVoidApprovalEnabled, loadVoidApprovalQueue, sessionLocked]);

    return {
        historyRows: visibleHistoryRows,
        historyLoading,
        historyPage,
        historyPageSize,
        setHistoryPageSize,
        historyPagination: visibleHistoryPagination,
        historySearch,
        setHistorySearch,
        historyStatus,
        setHistoryStatus,
        historyPaymentType,
        setHistoryPaymentType,
        historyOrderMethod,
        setHistoryOrderMethod,
        historyOrderSource,
        setHistoryOrderSource,
        historyCashierName,
        setHistoryCashierName,
        historyDateFrom,
        setHistoryDateFrom,
        historyDateTo,
        setHistoryDateTo,
        historyDetailLoading,
        voidingTransactionId,
        voidApprovalQueue,
        voidApprovalQueueLoading,
        voidApprovalQueueError,
        voidApprovalDialogOpen,
        voidApprovalSelectedRequest,
        voidApprovalDecisionLoading,
        refundWorkflowTransaction,
        refundWorkflowLoading,
        refundWorkflowSubmitting,
        openHistoryDetail,
        handleVoidHistoryTransaction,
        loadVoidApprovalQueue,
        openVoidApprovalQueue,
        closeVoidApprovalQueue,
        decideVoidApproval,
        openHistoryRefundWorkflow,
        closeHistoryRefundWorkflow,
        submitHistoryRefundWorkflow,
        openInPosReport,
        loadHistory
    };
};

export default usePosHistoryVoidWorkflow;

import { useCallback, useMemo, useRef } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
    createPosCheckout,
    createPosParkedSale,
    fetchPosCatalog,
    reparkPosParkedSale,
    cancelPosPaymentAllocation,
    cancelPosPaymentSession,
    completePosPaymentSession
} from '../services/posService';
import {
    TERMINAL_QUEUE_STATUS,
    enqueueTerminalOperationIntent,
    getReplayCandidateEntries,
    listTerminalOperationQueueEntries,
    markTerminalOperationFailedManualResolution,
    markTerminalOperationReplayed,
    markTerminalOperationReplaying,
    markTerminalOperationRetryScheduled
} from '../services/terminalOperationQueueStore.js';
import { clearPosCartDraft } from '../services/posCartDraftStore.js';
import { clearPosSplitPaymentSessionPointer } from '../services/posSplitPaymentSessionStore.js';
import { formatParkedSaleDisplayName } from '../utils/posParkedSaleDisplay.js';
import { buildFnbGlobalOrderNote } from '../utils/posOrderNotes.js';
import {
    buildCompliancePolicyBlockerMessage,
    buildMissingFieldsMessage,
    buildOfflineCheckoutHistoryRow,
    EMPTY_DISCOUNT_DRAFT,
    getLineKey,
    inferReceiptContract,
    round4,
    toArray
} from '../utils/posCheckoutTerminalUtils.js';
import {
    getActiveModifierOptions,
    getFnbModifierGroups,
    resolveModifierSnapshot
} from '../utils/posCheckoutTerminalModifiers.js';
import {
    CHECKOUT_QUEUE_MAX_RETRIES,
    CHECKOUT_QUEUE_OPERATION,
    CHECKOUT_REPLAY_BATCH_SIZE,
    computeCheckoutReplayBackoffMs,
    createIdempotencyKey,
    isCheckoutQueueEntry,
    isRetryableCheckoutReplayError,
    resolveCheckoutReplayErrorDetails
} from '../utils/posCheckoutTerminalQueue.js';
import { isServiceCatalogItem } from '../utils/posCatalogAvailability.js';
import { getDiscountLineRef } from '../utils/posDiscountSelection.js';
import { POS_HARDWARE_CAPABILITIES } from '../hardware/posHardwareContract.js';

/**
 * Owns checkout submission, offline replay, parked-sale ownership, split-payment
 * cancellation/completion, idempotency, and new-sale reset timing. The terminal
 * supplies state setters and remains the UI/receipt/hardware compatibility shell.
 */
export const usePosCheckoutWorkflow = ({
    sessionLocked = false,
    checkoutBlockedReason = '',
    activeShiftId = null,
    selectedLocationId = null,
    normalizedTerminalId = '',
    offlineSnapshotScope = {},
    posWorkflow = {},
    isFnbWorkflow = false,
    normalizedFnbContext = null,
    orderMethod = 'dine_in',
    tableNumber = '',
    kitchenNotes = '',
    servicesClientName = '',
    servicesDateTime = '',
    servicesProvider = '',
    servicesResource = '',
    servicesNotes = '',
    safeCatalog = [],
    discountProfiles = [],
    commercialPromoConfig = [],
    catalog = [],
    setCatalog = () => {},
    saveCatalogSnapshot = () => {},
    safeCart = [],
    setCart = () => {},
    activeParkedSale = null,
    setActiveParkedSale = () => {},
    parkedSalePayContext = null,
    setParkedSalePayContext = () => {},
    parkedSaleReleaseLoading = false,
    setParkedSaleReleaseLoading = () => {},
    setCheckoutLoading = () => {},
    setParkLoading = () => {},
    queuedCheckouts = [],
    setQueuedCheckouts = () => {},
    setReplayingQueuedCheckouts = () => {},
    onQueueOfflineOperation = async () => null,
    onManualUniversalSync = async () => ({ allowed: false }),
    onCheckoutCompleted = null,
    historyPage = 1,
    loadHistory = async () => {},
    loadCatalog = async () => {},
    setLastReceipt = () => {},
    setLastReceiptContract = () => {},
    setReceiptPreviewSource = () => {},
    setReceiptPreviewModalOpen = () => {},
    receiptSettings = {},
    posHardware = null,
    itemDiscountApprovalRef,
    discountApprovalRef,
    resetEmployeeCredit = () => {},
    setOrderMethod = () => {},
    setTableNumber = () => {},
    setKitchenNotes = () => {},
    setServicesClientName = () => {},
    setServicesDateTime = () => {},
    setServicesProvider = () => {},
    setServicesResource = () => {},
    setServicesNotes = () => {},
    setPaymentType = () => {},
    setSelectedDiscountProfile = () => {},
    setManualDiscountMode = () => {},
    setManualDiscountRateInput = () => {},
    setManualDiscountAmountInput = () => {},
    setAppliedDiscount = () => {},
    setDiscountDraft = () => {},
    setDiscountModalOpen = () => {},
    setShowDiscountPin = () => {},
    setAffiliateCodeInput = () => {},
    setCustomerPaymentAmountInput = () => {},
    setCustomerPaymentAmountAutoFilled = () => {},
    setCheckoutConfirmModalOpen = () => {},
    setMobileCheckoutPanelOpen = () => {},
    setItemOptionsLineKey = () => {},
    setServiceOptionsModal = () => {},
    setCurrentSaleHelpOpen = () => {},
    setParkedSalesDialogOpen = () => {},
    setParkSaleNameDialogOpen = () => {},
    parkSaleNameInput = '',
    setParkSaleNameInput = () => {},
    setCurrentViewMode = () => {},
    selectedDiscount = null,
    manualDiscountMode = 'none',
    manualDiscountRate = 0,
    manualDiscountAmount = 0,
    appliedDiscount = null,
    calculatedDiscountAmount = 0,
    affiliateCodeInput = '',
    itemDiscountTotals = { discountAmount: 0 },
    governedDiscountTotals = { vatRemoved: 0, vatExemptAmount: 0, discountAmount: 0 },
    cartSubtotal = 0,
    serviceFeeAmount = 0,
    restaurantServiceChargeAmount = 0,
    vatBreakdown = {},
    cartTotal = 0,
    paymentType = 'cash',
    checkoutWorkflowValidationMessage = null,
    isCheckoutWorkflowValid = true,
    isCashPayment = false,
    isEmployeeCreditPayment = false,
    isCustomerPaymentSufficient = true,
    customerPaymentFieldLabel = 'Payment',
    customerPaymentAmount = 0,
    customerPaymentChange = 0,
    employeeCreditAccountCode = '',
    splitPaymentSession = null,
    setSplitPaymentSession = () => {},
    setSplitPaymentDialogOpen = () => {},
    setSplitPaymentWorkflowVersion = () => {},
    splitPaymentStorageScopeKey = '',
    splitPaymentSuccessfulAllocations = [],
    setSplitPaymentCancelModalOpen = () => {},
    setSplitPaymentCancelLoading = () => {},
    splitPaymentDialogOpen = false,
    splitPaymentReady = false,
    splitPaymentSummaryAllocations = [],
    splitPaymentSummaryPaidAmount = 0,
    splitPaymentSummaryRemainingAmount = 0,
    splitPaymentSummaryChangeAmount = 0,
} = {}) => {
    const splitPaymentReturnToCheckoutRef = useRef(false);
    const schedulePostCheckoutTask = useCallback((task) => {
        // Let React commit the receipt/payment-complete UI before a legacy
        // synchronous JavascriptInterface call can occupy the WebView thread.
        // Do not chain whole checkout tasks: the native bridge already orders
        // physical commands, while audit and refresh calls may finish independently.
        setTimeout(() => {
            Promise.resolve()
                .then(task)
                .catch((error) => {
                    toast.error(error?.message || 'Payment completed, but a post-checkout task failed.');
                });
        }, 0);
    }, []);

    const handleSplitPaymentOpenChange = useCallback((nextOpen) => {
        setSplitPaymentDialogOpen(nextOpen);
        if (nextOpen) {
            setCheckoutConfirmModalOpen(false);
            return;
        }
        setCheckoutConfirmModalOpen(splitPaymentReturnToCheckoutRef.current);
        splitPaymentReturnToCheckoutRef.current = false;
    }, [setCheckoutConfirmModalOpen, setSplitPaymentDialogOpen]);

    const syncQueuedCheckoutsState = useCallback(async () => {
        const rows = await listTerminalOperationQueueEntries({
            includeResolved: false,
            scope: offlineSnapshotScope,
            statuses: [
                TERMINAL_QUEUE_STATUS.QUEUED,
                TERMINAL_QUEUE_STATUS.REPLAYING,
                TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
            ]
        });
        const checkoutRows = (Array.isArray(rows) ? rows : []).filter((entry) => isCheckoutQueueEntry(entry));
        setQueuedCheckouts(checkoutRows);
    }, [offlineSnapshotScope, setQueuedCheckouts]);

    const enqueueCheckoutIntent = useCallback(async (payload, source = 'unknown') => {
        const idempotencyKey = String(payload?.idempotency_key || createIdempotencyKey()).trim();
        if (!idempotencyKey) return null;
        const nowIso = new Date().toISOString();
        const entry = await enqueueTerminalOperationIntent({
            intent_id: idempotencyKey,
            operation: CHECKOUT_QUEUE_OPERATION,
            queue_scope: offlineSnapshotScope,
            payload: {
                ...payload,
                idempotency_key: idempotencyKey
            },
            queued_at: nowIso,
            updated_at: nowIso,
            source
        }, source);
        await syncQueuedCheckoutsState();
        return entry;
    }, [offlineSnapshotScope, syncQueuedCheckoutsState]);

    const replayQueuedCheckouts = useCallback(async ({ toastIfEmpty = false } = {}) => {
        if (sessionLocked || checkoutBlockedReason) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            if (toastIfEmpty) toast.error('Reconnect to the internet before syncing pending transactions.');
            return;
        }

        const candidates = (await getReplayCandidateEntries({
            scope: offlineSnapshotScope,
            limit: CHECKOUT_REPLAY_BATCH_SIZE
        })).filter((entry) => isCheckoutQueueEntry(entry));
        if (!Array.isArray(candidates) || candidates.length === 0) {
            await syncQueuedCheckoutsState();
            if (toastIfEmpty) toast.message('No queued checkouts.');
            return;
        }

        setReplayingQueuedCheckouts(true);
        let replayedCount = 0;
        let retryScheduledCount = 0;
        let failedManualCount = 0;
        try {
            for (const entry of candidates) {
                const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : {};
                const intentId = String(entry?.intent_id || payload?.idempotency_key || '').trim();
                if (!payload?.idempotency_key || !intentId) {
                    failedManualCount += 1;
                    await markTerminalOperationFailedManualResolution(intentId, {
                        error: { message: 'Queued payload is malformed.', code: 'POS_CHECKOUT_QUEUE_MALFORMED_ENTRY' }
                    });
                    continue;
                }

                try {
                    await markTerminalOperationReplaying(intentId);
                    const data = await createPosCheckout(payload);
                    replayedCount += 1;
                    setLastReceipt(data?.transaction || null);
                    setLastReceiptContract(inferReceiptContract(data?.transaction, data?.receipt_contract));
                    if (typeof onCheckoutCompleted === 'function') onCheckoutCompleted(data?.transaction || null);
                    await markTerminalOperationReplayed(intentId);
                } catch (error) {
                    const errorDetails = resolveCheckoutReplayErrorDetails(error);
                    if (isRetryableCheckoutReplayError(error)) {
                        const nextAttemptCount = (Number(entry?.attempt_count) || 0) + 1;
                        if (nextAttemptCount < CHECKOUT_QUEUE_MAX_RETRIES) {
                            await markTerminalOperationRetryScheduled(intentId, {
                                attemptCount: nextAttemptCount,
                                nextRetryAt: Date.now() + computeCheckoutReplayBackoffMs(nextAttemptCount),
                                error: errorDetails
                            });
                            retryScheduledCount += 1;
                            continue;
                        }
                    }
                    await markTerminalOperationFailedManualResolution(intentId, { error: errorDetails });
                    failedManualCount += 1;
                    if (!error?.response) continue;
                }
            }
        } finally {
            setReplayingQueuedCheckouts(false);
        }

        await syncQueuedCheckoutsState();
        if (replayedCount > 0) {
            toast.success(`${replayedCount} queued checkout${replayedCount === 1 ? '' : 's'} replayed successfully.`);
            loadCatalog();
            loadHistory(historyPage);
        } else if (toastIfEmpty) {
            toast.message('No queued checkouts were replayed.');
        }
        if (retryScheduledCount > 0) {
            toast.message(`${retryScheduledCount} queued checkout${retryScheduledCount === 1 ? '' : 's'} scheduled for retry.`);
        }
        if (failedManualCount > 0) {
            toast.error(`${failedManualCount} pending transaction${failedManualCount === 1 ? '' : 's'} could not sync. Try again from History.`);
        }
    }, [checkoutBlockedReason, historyPage, loadCatalog, loadHistory, offlineSnapshotScope, onCheckoutCompleted, sessionLocked, setLastReceipt, setLastReceiptContract, setReplayingQueuedCheckouts, syncQueuedCheckoutsState]);

    const handleManualUniversalSync = useCallback(async () => {
        const syncPermit = await onManualUniversalSync();
        if (!syncPermit?.allowed) return;
        await replayQueuedCheckouts({ toastIfEmpty: true });
    }, [onManualUniversalSync, replayQueuedCheckouts]);

    const resetDiscountState = useCallback(({ closeModal = true } = {}) => {
        setSelectedDiscountProfile('');
        setManualDiscountMode('none');
        setManualDiscountRateInput('');
        setManualDiscountAmountInput('');
        setAppliedDiscount(null);
        if (discountApprovalRef) discountApprovalRef.current = null;
        setDiscountDraft(EMPTY_DISCOUNT_DRAFT);
        if (closeModal) setDiscountModalOpen(false);
        setShowDiscountPin(false);
    }, [
        discountApprovalRef,
        setAppliedDiscount,
        setDiscountDraft,
        setDiscountModalOpen,
        setManualDiscountAmountInput,
        setManualDiscountMode,
        setManualDiscountRateInput,
        setSelectedDiscountProfile,
        setShowDiscountPin
    ]);

    const resetCheckoutModalState = useCallback(({ closeModal = true } = {}) => {
        setOrderMethod(posWorkflow.allowedMethods?.[0] || (posWorkflow.mode === 'services' ? 'walk_in' : 'dine_in'));
        setTableNumber('');
        setKitchenNotes('');
        setServicesClientName('');
        setServicesDateTime('');
        setServicesProvider('');
        setServicesResource('');
        setServicesNotes('');
        setPaymentType('cash');
        resetEmployeeCredit();
        resetDiscountState();
        splitPaymentReturnToCheckoutRef.current = false;
        setAffiliateCodeInput('');
        setCustomerPaymentAmountInput('');
        setCustomerPaymentAmountAutoFilled(false);
        if (closeModal) setCheckoutConfirmModalOpen(false);
    }, [
        posWorkflow,
        resetEmployeeCredit,
        resetDiscountState,
        setAffiliateCodeInput,
        setCheckoutConfirmModalOpen,
        setCustomerPaymentAmountAutoFilled,
        setCustomerPaymentAmountInput,
        setKitchenNotes,
        setOrderMethod,
        setPaymentType,
        setServicesClientName,
        setServicesDateTime,
        setServicesNotes,
        setServicesProvider,
        setServicesResource,
        setTableNumber
    ]);

    const resetCurrentSaleForNewSale = useCallback(() => {
        setCart([]);
        itemDiscountApprovalRef?.current?.clear?.();
        resetCheckoutModalState();
        setParkedSalePayContext(null);
        setItemOptionsLineKey(null);
        setServiceOptionsModal({ open: false, item: null, groups: [] });
    }, [
        itemDiscountApprovalRef,
        resetCheckoutModalState,
        setCart,
        setItemOptionsLineKey,
        setParkedSalePayContext,
        setServiceOptionsModal
    ]);

    const cancelActiveParkedSaleEditingAfterCartEmpty = useCallback(async ({ sessionEnd = false } = {}) => {
        const parkedSaleId = Number(activeParkedSale?.pos_parked_sale_id);
        const snapshot = activeParkedSale?.snapshot;
        if (!parkedSaleId || parkedSaleReleaseLoading) return false;
        if (!activeShiftId || !normalizedTerminalId) {
            if (!sessionEnd) toast.error('Open the active POS shift before cancelling parked-sale editing.');
            return false;
        }
        if (!snapshot || !Array.isArray(snapshot.lines) || snapshot.lines.length === 0) {
            if (!sessionEnd) toast.error('Unable to return this parked sale because its original items are unavailable.');
            return false;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            if (!sessionEnd) toast.error('Reconnect before cancelling parked-sale editing. The parked sale is still claimed and the current items were kept.');
            return false;
        }

        const parkedSaleLabel = formatParkedSaleDisplayName(activeParkedSale);
        setParkedSaleReleaseLoading(true);
        try {
            await reparkPosParkedSale(parkedSaleId, {
                shift_id: Number(activeShiftId),
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
                expected_revision: Number(activeParkedSale.revision),
                snapshot,
                subtotal_amount: Number(activeParkedSale.subtotal_amount || 0),
                total_amount: Number(activeParkedSale.total_amount || 0)
            });
            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
            setActiveParkedSale(null);
            resetCurrentSaleForNewSale();
            if (!sessionEnd) toast.info(`${parkedSaleLabel} remains available for the next cashier. Editing was cancelled because all items were removed.`);
            return true;
        } catch (error) {
            if (!sessionEnd) toast.error(error?.response?.data?.message || error?.message || 'Unable to release this parked sale. The current items were kept.');
            return false;
        } finally {
            setParkedSaleReleaseLoading(false);
        }
    }, [activeParkedSale, activeShiftId, normalizedTerminalId, offlineSnapshotScope, parkedSaleReleaseLoading, resetCurrentSaleForNewSale, selectedLocationId, setActiveParkedSale, setParkedSaleReleaseLoading]);

    const openCheckoutConfirmModal = useCallback(async () => {
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }
        if (!normalizedTerminalId) {
            toast.error('Select a terminal ID before checkout.');
            return;
        }
        if (safeCart.length === 0) {
            toast.error('Add at least one item before checkout.');
            return;
        }
        if (checkoutWorkflowValidationMessage) {
            toast.error(checkoutWorkflowValidationMessage);
            return;
        }
        const { validateFnbModifierSelections } = await import('../utils/fnbModifierValidation.js');
        const invalidModifierLine = safeCart.find((line) => validateFnbModifierSelections(line.modifier_groups || [], line.line_modifiers || [], selectedLocationId));
        if (invalidModifierLine) {
            toast.error(`${invalidModifierLine.item_name}: ${validateFnbModifierSelections(invalidModifierLine.modifier_groups || [], invalidModifierLine.line_modifiers || [], selectedLocationId)}`);
            setItemOptionsLineKey(getLineKey(invalidModifierLine));
            return;
        }
        if (!isCheckoutWorkflowValid) {
            toast.error(orderMethod === 'appointment'
                ? 'Enter the client name and appointment time before checkout.'
                : 'Enter the client name before checkout.');
            setCustomerPaymentAmountInput(round4(cartTotal).toFixed(2));
            setCustomerPaymentAmountAutoFilled(true);
            setCheckoutConfirmModalOpen(true);
            return;
        }
        if (
            paymentType === 'employee_credit'
            && typeof navigator !== 'undefined'
            && navigator.onLine === false
        ) {
            toast.error('Employee Credit requires an online connection.');
            return;
        }
        setCustomerPaymentAmountInput(round4(cartTotal).toFixed(2));
        setCustomerPaymentAmountAutoFilled(true);
        setCheckoutConfirmModalOpen(true);
        setMobileCheckoutPanelOpen(false);
    }, [cartTotal, checkoutBlockedReason, checkoutWorkflowValidationMessage, isCheckoutWorkflowValid, normalizedTerminalId, orderMethod, paymentType, safeCart, selectedLocationId, setCheckoutConfirmModalOpen, setCustomerPaymentAmountAutoFilled, setCustomerPaymentAmountInput, setItemOptionsLineKey, setMobileCheckoutPanelOpen]);

    const openSplitPaymentModal = useCallback(async () => {
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }
        if (!normalizedTerminalId) {
            toast.error('Select a terminal ID before recording payment.');
            return;
        }
        if (safeCart.length === 0) {
            toast.error('Add at least one item before recording payment.');
            return;
        }
        if (checkoutWorkflowValidationMessage) {
            toast.error(checkoutWorkflowValidationMessage);
            return;
        }
        if (isEmployeeCreditPayment) {
            toast.error('Employee Credit cannot be combined with split payment.');
            return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('Split Payment requires an online connection.');
            return;
        }
        const { validateFnbModifierSelections } = await import('../utils/fnbModifierValidation.js');
        const invalidModifierLine = safeCart.find((line) => validateFnbModifierSelections(line.modifier_groups || [], line.line_modifiers || [], selectedLocationId));
        if (invalidModifierLine) {
            toast.error(`${invalidModifierLine.item_name}: ${validateFnbModifierSelections(invalidModifierLine.modifier_groups || [], invalidModifierLine.line_modifiers || [], selectedLocationId)}`);
            setItemOptionsLineKey(invalidModifierLine.line_key || invalidModifierLine.line_id || invalidModifierLine.item_id);
            return;
        }
        if (!isCheckoutWorkflowValid) {
            toast.error(posWorkflow.mode === 'services' && orderMethod === 'appointment'
                ? 'Enter the client name and appointment time before recording payment.'
                : 'Enter the client name before recording payment.');
            return;
        }
        splitPaymentReturnToCheckoutRef.current = false;
        handleSplitPaymentOpenChange(true);
        setMobileCheckoutPanelOpen(false);
    }, [checkoutBlockedReason, checkoutWorkflowValidationMessage, handleSplitPaymentOpenChange, isCheckoutWorkflowValid, isEmployeeCreditPayment, normalizedTerminalId, orderMethod, posWorkflow.mode, safeCart, selectedLocationId, setItemOptionsLineKey, setMobileCheckoutPanelOpen]);

    const validateParkedSaleForResume = useCallback(async (parkedSale, action = 'pay') => {
        const normalizedAction = action === 'resume' ? 'resume' : 'pay';
        if (activeParkedSale?.pos_parked_sale_id
            && Number(activeParkedSale.pos_parked_sale_id) !== Number(parkedSale?.pos_parked_sale_id)) {
            return {
                ok: false,
                message: 'Finish, update, or cancel the currently resumed parked sale before opening another one.'
            };
        }
        if (normalizedAction === 'resume'
            && activeParkedSale?.pos_parked_sale_id
            && Number(activeParkedSale.pos_parked_sale_id) === Number(parkedSale?.pos_parked_sale_id)) {
            return {
                ok: false,
                message: 'This parked sale is already active in the current cart.'
            };
        }
        if (safeCart.length > 0) {
            return {
                ok: false,
                message: normalizedAction === 'resume'
                    ? 'Resume requires an empty current sale. Park or clear the current sale first.'
                    : 'Pay requires an empty current sale. Park or clear the current sale first.'
            };
        }
        const [{
            getParkedSaleCatalogLookupQueries,
            mergeParkedSaleCatalogResults,
            validateParkedSaleResume
        }, { validateFnbModifierSelections }] = await Promise.all([
            import('../utils/posParkedSaleResume.js'),
            import('../utils/fnbModifierValidation.js')
        ]);
        const lookupQueries = getParkedSaleCatalogLookupQueries({ parkedSale });
        let resumeCatalog = safeCatalog;
        if (lookupQueries.length > 0) {
            try {
                const lookupResults = await Promise.all(lookupQueries.map((search) => fetchPosCatalog({
                    search,
                    limit: 200,
                    ...(selectedLocationId ? { location_id: selectedLocationId } : {})
                })));
                resumeCatalog = mergeParkedSaleCatalogResults(safeCatalog, lookupResults, parkedSale);
            } catch {
                return {
                    ok: false,
                    message: 'Unable to refresh the catalog items required by this parked sale. Check the connection and try again.'
                };
            }
        }
        const validation = validateParkedSaleResume({
            parkedSale,
            catalog: resumeCatalog,
            locationId: selectedLocationId,
            allowedOrderMethods: posWorkflow.allowedMethods,
            discountProfiles: toArray(discountProfiles),
            commercialPromoConfig: toArray(commercialPromoConfig),
            modifierValidator: ({ item, line, locationId }) => {
                const currentGroups = getFnbModifierGroups(item);
                const savedModifiers = toArray(line?.line_modifiers);
                if (savedModifiers.length > 0 && currentGroups.length === 0) {
                    return 'modifier selections are no longer available.';
                }
                const currentOptionIds = new Set(currentGroups.flatMap((group) => getActiveModifierOptions(group).map((option) => Number(option?.modifier_option_id))));
                if (savedModifiers.some((modifier) => !currentOptionIds.has(Number(modifier?.modifier_option_id)))) {
                    return 'one or more modifier selections are no longer available.';
                }
                return validateFnbModifierSelections(currentGroups, savedModifiers, locationId);
            }
        });
        if (!validation.ok) {
            return {
                ok: false,
                message: `This parked sale needs review before it can be resumed: ${validation.conflicts.slice(0, 3).join(' ')}`
            };
        }
        return {
            ok: true,
            resumeContext: {
                parkedSaleId: Number(parkedSale?.pos_parked_sale_id) || null,
                catalog: resumeCatalog
            }
        };
    }, [activeParkedSale?.pos_parked_sale_id, commercialPromoConfig, discountProfiles, posWorkflow, safeCatalog, safeCart.length, selectedLocationId]);

    const handleParkedSaleClaimed = useCallback(async (claimedSale, action = 'pay', resumeContext = null) => {
        const normalizedAction = action === 'resume' ? 'resume' : 'pay';
        const { buildResumedCartLines } = await import('../utils/posParkedSaleResume.js');
        const snapshot = claimedSale?.snapshot && typeof claimedSale.snapshot === 'object'
            ? claimedSale.snapshot
            : {};
        const claimedSaleId = Number(claimedSale?.pos_parked_sale_id);
        if (Number(resumeContext?.parkedSaleId) !== claimedSaleId || !Array.isArray(resumeContext?.catalog)) {
            throw new Error('This parked sale must be revalidated before it can be resumed. Reopen Parked Sales and try again.');
        }
        const validatedCatalog = resumeContext.catalog;
        const resumedLines = buildResumedCartLines({ parkedSale: claimedSale, catalog: validatedCatalog });
        const services = snapshot.services && typeof snapshot.services === 'object' ? snapshot.services : {};
        const discountContext = snapshot.discount_context && typeof snapshot.discount_context === 'object'
            ? snapshot.discount_context
            : {};
        const selectedProfile = discountContext.selected_profile && typeof discountContext.selected_profile === 'object'
            ? discountContext.selected_profile
            : null;
        const applied = discountContext.applied && typeof discountContext.applied === 'object'
            ? discountContext.applied
            : null;
        const defaultOrderMethod = posWorkflow.allowedMethods[0] || (posWorkflow.mode === 'services' ? 'walk_in' : 'dine_in');
        const resumedOrderMethod = posWorkflow.allowedMethods.includes(snapshot.order_method)
            ? snapshot.order_method
            : defaultOrderMethod;
        itemDiscountApprovalRef?.current?.clear?.();
        setCart(resumedLines);
        setPaymentType('cash');
        resetEmployeeCredit();
        setCustomerPaymentAmountInput('');
        setCustomerPaymentAmountAutoFilled(false);
        setCheckoutConfirmModalOpen(false);
        setMobileCheckoutPanelOpen(false);
        setItemOptionsLineKey(null);
        setServiceOptionsModal({ open: false, item: null, groups: [] });
        setActiveParkedSale({
            pos_parked_sale_id: Number(claimedSale?.pos_parked_sale_id),
            park_reference: claimedSale?.park_reference || null,
            revision: Number(claimedSale?.revision || 1),
            parked_sale_name: String(snapshot.parked_sale_name || '').trim() || null,
            snapshot,
            subtotal_amount: Number(claimedSale?.subtotal_amount || 0),
            total_amount: Number(claimedSale?.total_amount || 0)
        });
        setParkedSalePayContext(normalizedAction === 'pay'
            ? {
                snapshot,
                subtotalAmount: Number(claimedSale?.subtotal_amount || 0),
                totalAmount: Number(claimedSale?.total_amount || 0)
            }
            : null);

        let approvalResetMessage = '';
        setOrderMethod(resumedOrderMethod);
        setTableNumber(String(snapshot.table_number || ''));
        setKitchenNotes(String(snapshot.kitchen_notes || ''));
        setServicesClientName(String(services.client_name || ''));
        setServicesDateTime(String(services.scheduled_for || '').slice(0, 16));
        setServicesProvider(String(services.provider || ''));
        setServicesResource(String(services.resource || ''));
        setServicesNotes(String(services.notes || ''));
        setAffiliateCodeInput('');

        if (applied) {
            setAppliedDiscount(null);
            if (discountApprovalRef) discountApprovalRef.current = null;
            setDiscountDraft({ ...EMPTY_DISCOUNT_DRAFT, ...applied, manager_pin: '' });
            setSelectedDiscountProfile('');
            setManualDiscountMode('none');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            approvalResetMessage = ' Re-enter discount approval before checkout.';
        } else if (selectedProfile?.name) {
            setAppliedDiscount(null);
            if (discountApprovalRef) discountApprovalRef.current = null;
            setDiscountDraft(EMPTY_DISCOUNT_DRAFT);
            setSelectedDiscountProfile(String(selectedProfile.name));
            setManualDiscountMode('none');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
        } else {
            setAppliedDiscount(null);
            if (discountApprovalRef) discountApprovalRef.current = null;
            setDiscountDraft(EMPTY_DISCOUNT_DRAFT);
            setSelectedDiscountProfile('');
            setManualDiscountMode(String(discountContext.manual_mode || 'none'));
            setManualDiscountRateInput(discountContext.manual_rate ? String(discountContext.manual_rate) : '');
            setManualDiscountAmountInput(discountContext.manual_amount ? String(discountContext.manual_amount) : '');
        }
        if (normalizedAction === 'pay') {
            setCurrentViewMode('checkout');
            setCustomerPaymentAmountInput(round4(cartTotal).toFixed(2));
            setCustomerPaymentAmountAutoFilled(true);
            setCheckoutConfirmModalOpen(true);
            setMobileCheckoutPanelOpen(false);
            toast.success(`Ready to pay ${formatParkedSaleDisplayName(claimedSale)}. Review the cart before checkout.${approvalResetMessage}`);
        } else {
            toast.success(`Resumed ${formatParkedSaleDisplayName(claimedSale)}. Add items as needed, then checkout.`);
        }
    }, [
        cartTotal,
        discountApprovalRef,
        itemDiscountApprovalRef,
        posWorkflow,
        resetEmployeeCredit,
        setActiveParkedSale,
        setAffiliateCodeInput,
        setAppliedDiscount,
        setCart,
        setCheckoutConfirmModalOpen,
        setCustomerPaymentAmountAutoFilled,
        setCustomerPaymentAmountInput,
        setDiscountDraft,
        setItemOptionsLineKey,
        setKitchenNotes,
        setManualDiscountAmountInput,
        setManualDiscountMode,
        setManualDiscountRateInput,
        setMobileCheckoutPanelOpen,
        setOrderMethod,
        setParkedSalePayContext,
        setPaymentType,
        setSelectedDiscountProfile,
        setServiceOptionsModal,
        setServicesClientName,
        setServicesDateTime,
        setServicesNotes,
        setServicesProvider,
        setServicesResource,
        setTableNumber,
        setCurrentViewMode
    ]);

    const handleParkAndNewSale = useCallback(async (nameOverride = null) => {
        const parkedSaleName = String(nameOverride ?? parkSaleNameInput).trim();
        if (!parkedSaleName) {
            toast.error('Enter a customer or order name before parking this sale.');
            return;
        }
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }
        if (!activeShiftId) {
            toast.error('Open a POS shift before parking a sale.');
            return;
        }
        if (!normalizedTerminalId) {
            toast.error('Select a terminal ID before parking a sale.');
            return;
        }
        if (safeCart.length === 0) {
            toast.error('Add at least one item before parking a sale.');
            return;
        }

        const snapshot = {
            schema_version: 1,
            parked_sale_name: parkedSaleName,
            order_method: orderMethod,
            table_number: tableNumber.trim() || null,
            kitchen_notes: kitchenNotes.trim() || null,
            services: posWorkflow.mode === 'services'
                ? {
                    client_name: servicesClientName.trim() || null,
                    scheduled_for: servicesDateTime || null,
                    provider: servicesProvider.trim() || null,
                    resource: servicesResource.trim() || null,
                    notes: servicesNotes.trim() || null
                }
                : null,
            fnb_context: normalizedFnbContext || null,
            discount_context: {
                selected_profile: selectedDiscount ? {
                    name: selectedDiscount.name || null,
                    percentage: Number(selectedDiscount.percentage || 0)
                } : null,
                manual_mode: manualDiscountMode,
                manual_rate: Number(manualDiscountRate || 0),
                manual_amount: Number(manualDiscountAmount || 0),
                applied: appliedDiscount ? {
                    type: appliedDiscount.type || null,
                    label: appliedDiscount.label || null,
                    method: appliedDiscount.method || null,
                    rate: Number(appliedDiscount.rate || 0),
                    amount: appliedDiscount.amount == null ? null : Number(appliedDiscount.amount),
                    customer_name: appliedDiscount.customer_name || null,
                    id_number: appliedDiscount.id_number || null,
                    employee_name: appliedDiscount.employee_name || null,
                    employee_id: appliedDiscount.employee_id || null,
                    employee_directory_id: Number(appliedDiscount.employee_directory_id) || null,
                    approver_user_id: appliedDiscount.approver_user_id || null,
                    approver_name: appliedDiscount.approver_name || null,
                    promo_code: appliedDiscount.promo_code || null,
                    eligible_item_ids: toArray(appliedDiscount.eligible_item_ids),
                    eligible_items: toArray(appliedDiscount.eligible_items)
                } : null
            },
            lines: safeCart.map((line) => ({
                line_key: line.line_key || null,
                item_id: Number(line.item_id),
                item_name: line.item_name || null,
                quantity: Number(line.quantity),
                base_sale_price: Number(line.base_sale_price || 0),
                sale_price: Number(line.sale_price),
                price_override_reason: line.price_override_reason || null,
                unit_of_measure: line.unit_of_measure || null,
                category: line.category || null,
                vat_type: line.vat_type || null,
                senior_pwd_discount_eligible: line.senior_pwd_discount_eligible === true,
                course: line.course || null,
                kitchen_station_id: line.kitchen_station_id || null,
                service_option_ids: toArray(line.service_option_ids),
                service_option_details: toArray(line.service_option_details),
                modifier_groups: toArray(line.modifier_groups),
                line_modifiers: toArray(line.line_modifiers),
                special_instructions: line.special_instructions || null,
                item_discount: line.item_discount ? {
                    discount_type: line.item_discount.discount_type || 'manual',
                    label: line.item_discount.label || 'Item Discount',
                    method: line.item_discount.method,
                    rate: line.item_discount.rate == null ? null : Number(line.item_discount.rate),
                    amount: line.item_discount.amount == null ? null : Number(line.item_discount.amount),
                    customer_name: line.item_discount.customer_name || null,
                    id_number: line.item_discount.id_number || null,
                    employee_name: line.item_discount.employee_name || null,
                    employee_id: line.item_discount.employee_id || null,
                    employee_directory_id: Number(line.item_discount.employee_directory_id) || null,
                    promo_code: line.item_discount.promo_code || null,
                    reason: line.item_discount.reason || null,
                    approver_user_id: line.item_discount.approver_user_id || null,
                    approver_name: line.item_discount.approver_name || null,
                    approved_at: line.item_discount.approved_at || null
                } : null,
                scan_metadata: line.scan_metadata || null
            }))
        };

        const parkPayload = {
            idempotency_key: createIdempotencyKey('pos-parked-sale'),
            shift_id: Number(activeShiftId),
            terminal_id: normalizedTerminalId,
            location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
            snapshot,
            subtotal_amount: Number(cartSubtotal || 0),
            total_amount: Number(cartTotal || 0)
        };
        const offlinePark = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offlinePark && activeParkedSale?.pos_parked_sale_id) {
            toast.error('Reconnect before parking this resumed sale again. Your cart is still open.');
            return;
        }

        setParkLoading(true);
        try {
            if (offlinePark) {
                const queuedIntentId = await onQueueOfflineOperation({
                    intent_id: parkPayload.idempotency_key,
                    operation: 'parked_sale',
                    shift_id: Number(activeShiftId),
                    payload: parkPayload
                }, 'offline_parked_sale');
                if (!queuedIntentId) {
                    throw new Error('Offline parked-sale queue is unavailable. Your current cart is still open.');
                }
                clearPosCartDraft(offlineSnapshotScope, activeShiftId);
                resetCurrentSaleForNewSale();
                setParkSaleNameDialogOpen(false);
                setParkSaleNameInput('');
                toast.message('Sale saved locally as a pending parked sale. Press Sync after reconnecting to send it.');
                return;
            }

            const parkedSale = activeParkedSale?.pos_parked_sale_id
                ? await reparkPosParkedSale(activeParkedSale.pos_parked_sale_id, {
                    ...parkPayload,
                    idempotency_key: undefined,
                    expected_revision: Number(activeParkedSale.revision)
                })
                : await createPosParkedSale(parkPayload);
            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
            setActiveParkedSale(null);
            resetCurrentSaleForNewSale();
            setParkSaleNameDialogOpen(false);
            setParkSaleNameInput('');
            toast.success(`${formatParkedSaleDisplayName(parkedSale)} ${activeParkedSale ? 'updated' : 'saved'}. New sale ready.`);
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Sale was not parked. Your current cart is still open.');
        } finally {
            setParkLoading(false);
        }
    }, [
        activeParkedSale,
        activeShiftId,
        appliedDiscount,
        cartSubtotal,
        cartTotal,
        checkoutBlockedReason,
        manualDiscountAmount,
        manualDiscountMode,
        manualDiscountRate,
        kitchenNotes,
        normalizedFnbContext,
        normalizedTerminalId,
        offlineSnapshotScope,
        onQueueOfflineOperation,
        orderMethod,
        parkSaleNameInput,
        posWorkflow.mode,
        resetCurrentSaleForNewSale,
        safeCart,
        selectedDiscount,
        selectedLocationId,
        servicesClientName,
        servicesDateTime,
        servicesNotes,
        servicesProvider,
        servicesResource,
        setActiveParkedSale,
        setParkLoading,
        setParkSaleNameDialogOpen,
        setParkSaleNameInput,
        tableNumber
    ]);

    const openParkSaleNameDialog = useCallback(() => {
        if (activeParkedSale?.pos_parked_sale_id) {
            void handleParkAndNewSale(activeParkedSale.parked_sale_name || formatParkedSaleDisplayName(activeParkedSale));
            return;
        }
        const suggestedName = activeParkedSale?.parked_sale_name
            || servicesClientName.trim()
            || (tableNumber.trim() ? `Table ${tableNumber.trim()}` : '');
        setParkSaleNameInput(suggestedName);
        setParkSaleNameDialogOpen(true);
    }, [activeParkedSale, handleParkAndNewSale, servicesClientName, setParkSaleNameDialogOpen, setParkSaleNameInput, tableNumber]);

    const openParkedSalesHistory = useCallback(() => {
        setCurrentSaleHelpOpen(false);
        setParkedSalesDialogOpen(true);
    }, [setCurrentSaleHelpOpen, setParkedSalesDialogOpen]);

    const clearSplitPaymentState = useCallback(() => {
        clearPosSplitPaymentSessionPointer(splitPaymentStorageScopeKey);
        splitPaymentReturnToCheckoutRef.current = false;
        setSplitPaymentSession(null);
        setSplitPaymentDialogOpen(false);
        setSplitPaymentWorkflowVersion((version) => version + 1);
    }, [setSplitPaymentDialogOpen, setSplitPaymentSession, setSplitPaymentWorkflowVersion, splitPaymentStorageScopeKey]);

    const releaseClaimedParkedSaleAfterPayCancel = useCallback(async () => {
        const parkedSaleId = Number(activeParkedSale?.pos_parked_sale_id);
        const snapshot = parkedSalePayContext?.snapshot;
        if (!parkedSaleId || !parkedSalePayContext) {
            setCheckoutConfirmModalOpen(false);
            return true;
        }
        if (!activeShiftId || !normalizedTerminalId) {
            toast.error('Open the active POS shift before cancelling this payment.');
            return false;
        }
        if (!snapshot || !Array.isArray(snapshot.lines) || snapshot.lines.length === 0) {
            toast.error('Unable to return this parked sale because its original items are unavailable.');
            return false;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            toast.error('Reconnect before cancelling payment. The parked sale is still claimed and the current items were kept.');
            return false;
        }

        const parkedSaleLabel = formatParkedSaleDisplayName(activeParkedSale);
        setParkedSaleReleaseLoading(true);
        try {
            await reparkPosParkedSale(parkedSaleId, {
                shift_id: Number(activeShiftId),
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId ? Number(selectedLocationId) : undefined,
                expected_revision: Number(activeParkedSale.revision),
                snapshot,
                subtotal_amount: Number(parkedSalePayContext.subtotalAmount || 0),
                total_amount: Number(parkedSalePayContext.totalAmount || 0)
            });
            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
            setActiveParkedSale(null);
            resetCurrentSaleForNewSale();
            toast.success(`${parkedSaleLabel} payment cancelled. The parked sale is available again.`);
            return true;
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to cancel payment. The current items were kept.');
            return false;
        } finally {
            setParkedSaleReleaseLoading(false);
        }
    }, [activeParkedSale, activeShiftId, normalizedTerminalId, offlineSnapshotScope, parkedSalePayContext, resetCurrentSaleForNewSale, selectedLocationId, setActiveParkedSale, setCheckoutConfirmModalOpen, setParkedSaleReleaseLoading]);

    const handleCancelCheckout = useCallback(async () => {
        const sessionId = Number(splitPaymentSession?.pos_payment_session_id || splitPaymentSession?.id || 0);
        if (!sessionId) {
            if (parkedSalePayContext && activeParkedSale?.pos_parked_sale_id) {
                await releaseClaimedParkedSaleAfterPayCancel();
            } else {
                resetCheckoutModalState();
            }
            return;
        }
        if (splitPaymentSuccessfulAllocations.length > 0) {
            setSplitPaymentCancelModalOpen(true);
            return;
        }

        setSplitPaymentCancelLoading(true);
        try {
            await cancelPosPaymentSession(sessionId, {
                shift_id: activeShiftId,
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId || undefined,
                reason: 'Cashier cancelled split-payment checkout before payment was recorded.'
            });
            clearSplitPaymentState();
            resetCheckoutModalState();
            toast.success('Split-payment draft cancelled. New checkout ready.');
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to cancel the split-payment draft.');
        } finally {
            setSplitPaymentCancelLoading(false);
        }
    }, [activeParkedSale?.pos_parked_sale_id, activeShiftId, clearSplitPaymentState, normalizedTerminalId, parkedSalePayContext, releaseClaimedParkedSaleAfterPayCancel, resetCheckoutModalState, selectedLocationId, setSplitPaymentCancelLoading, setSplitPaymentCancelModalOpen, splitPaymentSession, splitPaymentSuccessfulAllocations.length]);

    const handleKeepSplitPaymentAndClose = useCallback(() => {
        setSplitPaymentCancelModalOpen(false);
        setCheckoutConfirmModalOpen(false);
        toast.message('Saved split payment kept. Resume it from checkout to finish the sale.');
    }, [setCheckoutConfirmModalOpen, setSplitPaymentCancelModalOpen]);

    const handleReverseSplitPaymentAndStartNew = useCallback(async () => {
        const sessionId = Number(splitPaymentSession?.pos_payment_session_id || splitPaymentSession?.id || 0);
        if (!sessionId || splitPaymentSuccessfulAllocations.length === 0) return;

        setSplitPaymentCancelLoading(true);
        try {
            for (const allocation of splitPaymentSuccessfulAllocations) {
                const allocationId = Number(allocation?.pos_payment_allocation_id || allocation?.id || 0);
                if (!allocationId) throw new Error('A split-payment allocation identifier is missing.');
                await cancelPosPaymentAllocation(sessionId, allocationId, {
                    shift_id: activeShiftId,
                    terminal_id: normalizedTerminalId,
                    location_id: selectedLocationId || undefined,
                    reason: 'Cashier cancelled split-payment checkout before sale completion.'
                });
            }
            await cancelPosPaymentSession(sessionId, {
                shift_id: activeShiftId,
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId || undefined,
                reason: 'All split-payment allocations were reversed before starting a new checkout.'
            });
            clearSplitPaymentState();
            setSplitPaymentCancelModalOpen(false);
            resetCheckoutModalState();
            toast.success('Split payment reversed and cancelled. New checkout ready.');
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to reverse the split payment. Review the saved payment and try again.');
        } finally {
            setSplitPaymentCancelLoading(false);
        }
    }, [activeShiftId, clearSplitPaymentState, normalizedTerminalId, resetCheckoutModalState, selectedLocationId, setSplitPaymentCancelLoading, setSplitPaymentCancelModalOpen, splitPaymentSession, splitPaymentSuccessfulAllocations]);

    const handleCompletePreparedSplitPayment = useCallback(async (preparedSession = null) => {
        const sessionToComplete = preparedSession || splitPaymentSession;
        const sessionId = Number(sessionToComplete?.pos_payment_session_id || sessionToComplete?.id || 0);
        const isReady = round4(sessionToComplete?.remaining_amount) === 0;
        if (!sessionId || !isReady) {
            toast.error('Complete the split payment allocation before confirming.');
            return false;
        }

        setCheckoutLoading(true);
        try {
            const result = await completePosPaymentSession(sessionId, {
                idempotency_key: `split-complete:${sessionId}`,
                shift_id: activeShiftId,
                terminal_id: normalizedTerminalId,
                location_id: selectedLocationId || undefined
            });
            const transaction = result?.transaction || null;
            if (!transaction) {
                throw new Error('The server completed no transaction. Resume the saved payment and try again.');
            }
            clearSplitPaymentState();
            setLastReceipt(transaction);
            setLastReceiptContract(inferReceiptContract(transaction, result?.receipt_contract));
            setCart([]);
            itemDiscountApprovalRef?.current?.clear?.();
            setActiveParkedSale(null);
            setSelectedDiscountProfile('');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setAppliedDiscount(null);
            if (discountApprovalRef) discountApprovalRef.current = null;
            setAffiliateCodeInput('');
            setCustomerPaymentAmountInput('');
            setCustomerPaymentAmountAutoFilled(false);
            setCheckoutConfirmModalOpen(false);
            setReceiptPreviewSource('order_preview');
            setReceiptPreviewModalOpen(true);
            loadCatalog();
            loadHistory(historyPage);
            if (typeof onCheckoutCompleted === 'function') onCheckoutCompleted(transaction);
            return true;
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Unable to finish the split payment. Review the payment and try again.');
            return false;
        } finally {
            setCheckoutLoading(false);
        }
    }, [activeShiftId, clearSplitPaymentState, discountApprovalRef, historyPage, itemDiscountApprovalRef, loadCatalog, loadHistory, normalizedTerminalId, onCheckoutCompleted, selectedLocationId, setActiveParkedSale, setAffiliateCodeInput, setAppliedDiscount, setCart, setCheckoutConfirmModalOpen, setCustomerPaymentAmountAutoFilled, setCustomerPaymentAmountInput, setLastReceipt, setLastReceiptContract, setManualDiscountAmountInput, setManualDiscountRateInput, setReceiptPreviewModalOpen, setReceiptPreviewSource, setSelectedDiscountProfile, setCheckoutLoading, splitPaymentSession]);

    const splitPaymentCheckoutContext = useMemo(() => ({
        orderMethod,
        posWorkflowMode: posWorkflow.mode,
        servicesClientName,
        servicesNotes,
        servicesDateTime,
        tableNumber,
        kitchenNotes,
        appliedDiscount,
        discountApproval: discountApprovalRef?.current,
        itemDiscountApproval: itemDiscountApprovalRef?.current,
        selectedDiscount,
        manualDiscountAmount,
        manualDiscountMode,
        manualDiscountRate,
        calculatedDiscountAmount,
        affiliateCodeInput,
        fnbContext: normalizedFnbContext,
        cart: safeCart
    }), [
        affiliateCodeInput,
        appliedDiscount,
        calculatedDiscountAmount,
        discountApprovalRef,
        itemDiscountApprovalRef,
        manualDiscountAmount,
        manualDiscountMode,
        manualDiscountRate,
        normalizedFnbContext,
        orderMethod,
        posWorkflow.mode,
        safeCart,
        selectedDiscount,
        servicesClientName,
        servicesDateTime,
        servicesNotes,
        tableNumber,
        kitchenNotes
    ]);

    const handleCheckout = useCallback(async (paymentSnapshot = null) => {
        const hasPaymentSnapshot = paymentSnapshot && typeof paymentSnapshot === 'object'
            && paymentSnapshot.customerPaymentAmount !== undefined;
        const requestedCustomerPaymentAmount = hasPaymentSnapshot
            ? Number(paymentSnapshot.customerPaymentAmount || 0)
            : Number(customerPaymentAmount || 0);
        const requestedCustomerPaymentChange = hasPaymentSnapshot
            ? Number(paymentSnapshot.customerPaymentChange || 0)
            : Number(customerPaymentChange || 0);
        const effectiveCustomerPaymentAmount = Number.isFinite(requestedCustomerPaymentAmount) && requestedCustomerPaymentAmount >= 0
            ? requestedCustomerPaymentAmount
            : 0;
        const effectiveCustomerPaymentChange = Number.isFinite(requestedCustomerPaymentChange) && requestedCustomerPaymentChange >= 0
            ? requestedCustomerPaymentChange
            : 0;
        const effectiveCustomerPaymentSufficient = hasPaymentSnapshot
            ? paymentSnapshot.isCustomerPaymentSufficient === true
            : isCustomerPaymentSufficient;
        if (checkoutBlockedReason) {
            toast.error(checkoutBlockedReason);
            return;
        }
        if (!normalizedTerminalId) {
            toast.error('Select a terminal ID before checkout.');
            return;
        }
        if (safeCart.length === 0) {
            toast.error('Add at least one item before checkout.');
            return;
        }
        if (checkoutWorkflowValidationMessage) {
            toast.error(checkoutWorkflowValidationMessage);
            setCheckoutConfirmModalOpen(false);
            return;
        }
        if (!effectiveCustomerPaymentSufficient) {
            toast.error(isEmployeeCreditPayment
                ? 'Verify an active, eligible employee account with enough available balance.'
                : `${customerPaymentFieldLabel} must cover the total due.`);
            setCheckoutConfirmModalOpen(true);
            return;
        }
        const offlineCheckout = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offlineCheckout && activeParkedSale?.pos_parked_sale_id) {
            toast.error('Reconnect before checking out this resumed parked sale. Your cart is still open.');
            return;
        }
        if (offlineCheckout && !isCashPayment) {
            toast.error('Only cash transactions can be recorded offline. Reconnect before using an external payment method.');
            return;
        }

        const payload = {
            idempotency_key: createIdempotencyKey(),
            terminal_id: normalizedTerminalId || undefined,
            location_id: selectedLocationId || undefined,
            order_method: orderMethod,
            table_number: isFnbWorkflow && orderMethod === 'dine_in' ? tableNumber.trim() || undefined : undefined,
            customer_name: posWorkflow.mode === 'services' ? servicesClientName.trim() || undefined : undefined,
            special_instructions: posWorkflow.mode === 'services'
                ? servicesNotes.trim() || undefined
                : (isFnbWorkflow ? buildFnbGlobalOrderNote({ kitchenNotes }) || undefined : undefined),
            scheduled_for: posWorkflow.mode === 'services' && servicesDateTime
                ? new Date(servicesDateTime).toISOString()
                : undefined,
            payment_type: paymentType,
            payment_handoff_mode: ['cash', 'employee_credit'].includes(paymentType) ? 'internal' : 'external',
            cash_received: isCashPayment ? effectiveCustomerPaymentAmount : undefined,
            change_amount: isCashPayment ? effectiveCustomerPaymentChange : undefined,
            employee_credit: isEmployeeCreditPayment ? {
                account_code: employeeCreditAccountCode.trim().toUpperCase()
            } : undefined,
            discount_mode: appliedDiscount ? 'amount' : (selectedDiscount ? 'preset' : (manualDiscountAmount > 0 ? manualDiscountMode : 'none')),
            discount_amount: Number(calculatedDiscountAmount || 0),
            item_discount_amount: Number(itemDiscountTotals.discountAmount || 0),
            discount_profile_name: appliedDiscount ? undefined : (selectedDiscount?.name || null),
            discount_rate: appliedDiscount
                ? undefined
                : selectedDiscount
                    ? Number(selectedDiscount.percentage)
                    : (manualDiscountMode === 'percentage' && manualDiscountRate > 0 ? Number(manualDiscountRate) : null),
            discount_beneficiary: appliedDiscount && ['senior', 'pwd'].includes(appliedDiscount.type) ? {
                category: appliedDiscount.type,
                name: appliedDiscount.customer_name,
                id_number: appliedDiscount.id_number
            } : undefined,
            discount_approval: appliedDiscount && discountApprovalRef?.current ? {
                discount_type: appliedDiscount.type,
                approver_user_id: appliedDiscount.approver_user_id,
                employee_directory_id: appliedDiscount.type === 'employee'
                    ? Number(appliedDiscount.employee_directory_id) || null
                    : null,
                manager_pin: discountApprovalRef.current.manager_pin
            } : undefined,
            governed_discount: appliedDiscount ? {
                ...appliedDiscount,
                vat_removed: governedDiscountTotals.vatRemoved,
                vat_exempt_amount: governedDiscountTotals.vatExemptAmount,
                discount_amount: governedDiscountTotals.discountAmount
            } : undefined,
            affiliate_code: affiliateCodeInput.trim() || undefined,
            shift_id: activeShiftId || undefined,
            parked_sale_id: activeParkedSale?.pos_parked_sale_id || undefined,
            fnb_check_id: normalizedFnbContext?.fnb_check_id || undefined,
            fnb_table_id: normalizedFnbContext?.fnb_table_id || undefined,
            fnb_table_label_snapshot: normalizedFnbContext?.fnb_table_label_snapshot
                || (isFnbWorkflow && orderMethod === 'dine_in' ? tableNumber.trim() || undefined : undefined),
            fnb_guest_count: normalizedFnbContext?.fnb_guest_count || undefined,
            fnb_server_id: normalizedFnbContext?.fnb_server_id || undefined,
            restaurant_service_charge: normalizedFnbContext?.restaurant_service_charge || undefined,
            lines: safeCart.map((line, index) => ({
                line_ref: getDiscountLineRef(line, index),
                item_id: line.item_id,
                quantity: Number(line.quantity),
                sale_price: Number(line.sale_price),
                ...(line.item_discount ? {
                    item_discount: {
                        discount_type: line.item_discount.discount_type || 'manual',
                        label: line.item_discount.label || 'Item Discount',
                        method: line.item_discount.method,
                        rate: line.item_discount.rate == null ? null : Number(line.item_discount.rate),
                        amount: line.item_discount.amount == null ? null : Number(line.item_discount.amount),
                        customer_name: line.item_discount.customer_name || null,
                        id_number: line.item_discount.id_number || null,
                        employee_name: line.item_discount.employee_name || null,
                        employee_id: line.item_discount.employee_id || null,
                        employee_directory_id: Number(line.item_discount.employee_directory_id) || null,
                        promo_code: line.item_discount.promo_code || null,
                        reason: line.item_discount.reason || null,
                        approver_user_id: line.item_discount.approver_user_id || null
                    },
                    ...(itemDiscountApprovalRef?.current?.get(getLineKey(line))?.manager_pin ? {
                        item_discount_approval: {
                            approver_user_id: itemDiscountApprovalRef.current.get(getLineKey(line)).approver_user_id,
                            employee_directory_id: line.item_discount.discount_type === 'employee'
                                ? Number(line.item_discount.employee_directory_id) || null
                                : null,
                            manager_pin: itemDiscountApprovalRef.current.get(getLineKey(line)).manager_pin
                        }
                    } : {})
                } : {}),
                price_override_reason: String(line.price_override_reason || '').trim() || undefined,
                ...(isFnbWorkflow ? {
                    course: line.course || normalizedFnbContext?.default_course || undefined,
                    line_modifiers: line.line_modifiers || undefined,
                    special_instructions: line.special_instructions || undefined,
                    kitchen_station_id: line.kitchen_station_id || undefined
                } : {}),
                ...(Array.isArray(line.service_option_ids) && line.service_option_ids.length > 0
                    ? { selected_option_ids: line.service_option_ids }
                    : {}),
                scan_metadata: line.scan_metadata || undefined
            }))
        };
        payload.offline_line_items_snapshot = safeCart.map((line) => ({
            line_id: line.line_key,
            line_key: line.line_key,
            item_id: line.item_id,
            item_name: line.item_name,
            quantity: Number(line.quantity),
            sale_price: Number(line.sale_price),
            item_discount: line.item_discount || null,
            special_instructions: line.special_instructions || '',
            selected_option_ids: Array.isArray(line.service_option_ids) ? line.service_option_ids : [],
            service_options_snapshot: Array.isArray(line.service_option_details) ? line.service_option_details : [],
            fnb_modifiers_snapshot: resolveModifierSnapshot(line, line.line_modifiers || [])
        }));
        payload.offline_discount_snapshot = selectedDiscount
            ? { name: selectedDiscount.name, percentage: Number(selectedDiscount.percentage || 0) }
            : null;
        payload.offline_totals = {
            cartSubtotal: Number(cartSubtotal || 0),
            calculatedDiscountAmount: Number(calculatedDiscountAmount || 0),
            manualDiscountMode,
            manualDiscountRate: Number(manualDiscountRate || 0),
            manualDiscountAmount: Number(manualDiscountAmount || 0),
            serviceFeeAmount: Number(serviceFeeAmount || 0),
            restaurantServiceChargeAmount: Number(restaurantServiceChargeAmount || 0),
            vatBreakdown: {
                vatableSales: Number(vatBreakdown.vatableSales || 0),
                vatAmount: Number(vatBreakdown.vatAmount || 0),
                vatExemptSales: Number(vatBreakdown.vatExemptSales || 0),
                zeroRatedSales: Number(vatBreakdown.zeroRatedSales || 0)
            },
            cartTotal: Number(cartTotal || 0)
        };
        payload.offline_history_snapshot = buildOfflineCheckoutHistoryRow({
            payload,
            queuedAt: new Date().toISOString(),
            cartSubtotal,
            calculatedDiscountAmount,
            serviceFeeAmount,
            restaurantServiceChargeAmount,
            vatBreakdown,
            cartTotal,
            selectedDiscount,
            manualDiscountRate,
            manualDiscountMode
        });

        const queueCheckoutIntentLocally = async (source) => {
            if (appliedDiscount || itemDiscountTotals.discountAmount > 0) {
                toast.error('Approved discounts require an online checkout so eligibility and the selected approver can be verified securely.');
                return;
            }
            try {
                await enqueueCheckoutIntent(payload, source);
            } catch (error) {
                toast.error(error?.message || 'Offline sale was not saved. Keep the cart open and retry after freeing device storage or reconnecting.');
                return false;
            }
            setLastReceipt(payload.offline_history_snapshot);
            setLastReceiptContract({ document_type: 'non_fiscal_slip', document_context: 'non_fiscal', label: 'PENDING SYNC' });
            setReceiptPreviewSource('order_preview');
            setReceiptPreviewModalOpen(true);
            const nextCatalog = catalog.map((item) => {
                if (item?.pos_always_available === true || isServiceCatalogItem(item)) return item;
                const soldQuantity = safeCart
                    .filter((line) => Number(line.item_id) === Number(item?.item_id))
                    .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
                if (soldQuantity <= 0) return item;
                return {
                    ...item,
                    current_stock: Math.max(0, Number(item.current_stock || 0) - soldQuantity)
                };
            });
            setCatalog(nextCatalog);
            saveCatalogSnapshot(nextCatalog);
            setCart([]);
            itemDiscountApprovalRef?.current?.clear?.();
            setActiveParkedSale(null);
            setSelectedDiscountProfile('');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            setAppliedDiscount(null);
            if (discountApprovalRef) discountApprovalRef.current = null;
            setAffiliateCodeInput('');
            resetEmployeeCredit();
            setCustomerPaymentAmountInput('');
            setCustomerPaymentAmountAutoFilled(false);
            setCheckoutConfirmModalOpen(false);
            const refreshedQueue = await listTerminalOperationQueueEntries({
                includeResolved: false,
                scope: offlineSnapshotScope,
                statuses: [
                    TERMINAL_QUEUE_STATUS.QUEUED,
                    TERMINAL_QUEUE_STATUS.REPLAYING,
                    TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
                ]
            });
            const nextQueueCount = (Array.isArray(refreshedQueue) ? refreshedQueue : [])
                .filter((entry) => isCheckoutQueueEntry(entry))
                .length;
            toast.message(`Offline transaction saved locally. Press Sync after reconnecting (${nextQueueCount} queued).`);
            return true;
        };

        if (offlineCheckout) {
            await queueCheckoutIntentLocally('offline_preflight');
            return;
        }

        let data;
        setCheckoutLoading(true);
        try {
            data = await createPosCheckout(payload);
        } catch (error) {
            if (!error?.response) {
                if (appliedDiscount) {
                    toast.error('Connection lost. Reconnect before completing a discounted sale.');
                } else {
                    await queueCheckoutIntentLocally('network_failure');
                }
                return;
            }
            const compliancePolicyBlocker = buildCompliancePolicyBlockerMessage(error);
            const { buildFnbRecipeBlockerMessage, buildValidationDetailMessage } = await import('../utils/posCheckoutErrorMessages.js');
            const rawMessage = String(error?.response?.data?.message || '').trim();
            const friendlyPriceOverrideMessage = /^Price override reason is required for item\b/i.test(rawMessage)
                ? 'Enter a price override reason of at least 3 characters before checkout.'
                : null;
            toast.error(
                compliancePolicyBlocker?.message
                || buildMissingFieldsMessage(error)
                || buildFnbRecipeBlockerMessage(error)
                || friendlyPriceOverrideMessage
                || buildValidationDetailMessage(error)
                || rawMessage
                || 'POS checkout failed'
            );
            if (compliancePolicyBlocker?.actionTarget) {
                toast.message(`Resolve blocker in ${compliancePolicyBlocker.actionTarget}`);
            }
            return;
        } finally {
            setCheckoutLoading(false);
        }

        const completedTransaction = data?.transaction || null;
        const receiptContract = inferReceiptContract(completedTransaction, data?.receipt_contract);

        // The server commit is the payment-completion boundary. Reveal the receipt
        // immediately; hardware, audit, queue cleanup, and refreshes are follow-up work.
        setLastReceipt(completedTransaction);
        setLastReceiptContract(receiptContract);
        setCart([]);
        itemDiscountApprovalRef?.current?.clear?.();
        setActiveParkedSale(null);
        setSelectedDiscountProfile('');
        setManualDiscountRateInput('');
        setManualDiscountAmountInput('');
        setAppliedDiscount(null);
        if (discountApprovalRef) discountApprovalRef.current = null;
        setAffiliateCodeInput('');
        setCustomerPaymentAmountInput('');
        setCustomerPaymentAmountAutoFilled(false);
        setCheckoutConfirmModalOpen(false);
        setReceiptPreviewSource('order_preview');
        setReceiptPreviewModalOpen(true);
        if (typeof onCheckoutCompleted === 'function') onCheckoutCompleted(completedTransaction);
        toast.success(
            data?.idempotent_replay
                ? `Replayed (${receiptContract?.label || 'receipt loaded'})`
                : `Done (${receiptContract?.label || 'receipt ready'})`
        );
        if (data?.terminal_identity_policy?.warning?.message) {
            toast.message(`Terminal policy warning: ${data.terminal_identity_policy.warning.message}`);
        }

        schedulePostCheckoutTask(async () => {
            try {
                if (posHardware?.supportsCapability?.(POS_HARDWARE_CAPABILITIES.AUTO_PRINT_CHECKOUT)) {
                    const printOutcome = await posHardware.printReceipt({
                        transaction: completedTransaction,
                        businessSettings: receiptSettings,
                        receiptContract,
                        openDrawerAfterPrint: isCashPayment,
                        shiftId: activeShiftId,
                        transactionId: completedTransaction?.pos_transaction_id,
                        terminalId: normalizedTerminalId,
                        reason: 'checkout_auto_print'
                    });
                    if (printOutcome.success) {
                        toast.success(isCashPayment ? 'Receipt printed and cash drawer opened.' : 'Receipt printed.');
                    } else if (
                        isCashPayment
                        && printOutcome.reasonCode !== 'IMIN_COMMAND_TIMEOUT'
                        && printOutcome.raw?.hardware?.mayHaveExecuted === false
                        && printOutcome.raw?.hardware?.drawerOpened !== true
                    ) {
                        const drawerOutcome = await posHardware.openDrawer({
                            shiftId: activeShiftId,
                            transactionId: completedTransaction?.pos_transaction_id,
                            terminalId: normalizedTerminalId,
                            reason: 'checkout_auto_open_drawer'
                        });
                        if (drawerOutcome.success) toast.success('Cash drawer opened.');
                        else toast.error(drawerOutcome.message || 'Receipt printing and cash drawer opening failed.');
                    } else {
                        toast.error(printOutcome.message || 'Checkout completed, but receipt printing failed.');
                    }
                }
            } catch (hardwareError) {
                toast.error(hardwareError?.message || 'Checkout completed, but the receipt printer or cash drawer failed.');
            }

            try {
                await markTerminalOperationReplayed(payload.idempotency_key, {
                    resolution_source: 'network_success',
                    resolution_note: 'Checkout completed while online'
                });
                await syncQueuedCheckoutsState();
            } catch {
                toast.error('Payment completed, but the local checkout queue status could not refresh.');
            }

            try {
                await Promise.all([loadCatalog(), loadHistory(historyPage)]);
            } catch {
                toast.error('Payment completed, but the latest catalog or sales history could not refresh.');
            }
        });
    }, [
        activeParkedSale,
        activeShiftId,
        affiliateCodeInput,
        appliedDiscount,
        calculatedDiscountAmount,
        cartSubtotal,
        cartTotal,
        catalog,
        checkoutBlockedReason,
        checkoutWorkflowValidationMessage,
        customerPaymentAmount,
        customerPaymentChange,
        customerPaymentFieldLabel,
        discountApprovalRef,
        schedulePostCheckoutTask,
        enqueueCheckoutIntent,
        employeeCreditAccountCode,
        governedDiscountTotals,
        historyPage,
        isCashPayment,
        isCustomerPaymentSufficient,
        isEmployeeCreditPayment,
        isFnbWorkflow,
        itemDiscountApprovalRef,
        itemDiscountTotals,
        kitchenNotes,
        loadCatalog,
        loadHistory,
        manualDiscountAmount,
        manualDiscountMode,
        manualDiscountRate,
        normalizedFnbContext,
        normalizedTerminalId,
        offlineSnapshotScope,
        onCheckoutCompleted,
        orderMethod,
        paymentType,
        posHardware,
        posWorkflow.mode,
        receiptSettings,
        restaurantServiceChargeAmount,
        resetEmployeeCredit,
        safeCart,
        saveCatalogSnapshot,
        selectedDiscount,
        selectedLocationId,
        serviceFeeAmount,
        servicesClientName,
        servicesDateTime,
        servicesNotes,
        setActiveParkedSale,
        setAffiliateCodeInput,
        setAppliedDiscount,
        setCatalog,
        setCart,
        setCheckoutConfirmModalOpen,
        setCheckoutLoading,
        setCustomerPaymentAmountAutoFilled,
        setCustomerPaymentAmountInput,
        setLastReceipt,
        setLastReceiptContract,
        setManualDiscountAmountInput,
        setManualDiscountRateInput,
        setReceiptPreviewModalOpen,
        setReceiptPreviewSource,
        setSelectedDiscountProfile,
        syncQueuedCheckoutsState,
        tableNumber,
        vatBreakdown
    ]);

    return {
        enqueueCheckoutIntent,
        syncQueuedCheckoutsState,
        replayQueuedCheckouts,
        handleManualUniversalSync,
        openCheckoutConfirmModal,
        openSplitPaymentModal,
        resetDiscountState,
        resetCheckoutModalState,
        resetCurrentSaleForNewSale,
        cancelActiveParkedSaleEditingAfterCartEmpty,
        validateParkedSaleForResume,
        handleParkedSaleClaimed,
        handleParkAndNewSale,
        openParkSaleNameDialog,
        openParkedSalesHistory,
        clearSplitPaymentState,
        releaseClaimedParkedSaleAfterPayCancel,
        handleCancelCheckout,
        handleKeepSplitPaymentAndClose,
        handleReverseSplitPaymentAndStartNew,
        handleCompletePreparedSplitPayment,
        splitPaymentCheckoutContext,
        handleSplitPaymentOpenChange,
        handleCheckout,
        splitPaymentReady,
        splitPaymentSummaryAllocations,
        splitPaymentSummaryPaidAmount,
        splitPaymentSummaryRemainingAmount,
        splitPaymentSummaryChangeAmount,
        splitPaymentDialogOpen,
        queuedCheckouts
    };
};

export default usePosCheckoutWorkflow;

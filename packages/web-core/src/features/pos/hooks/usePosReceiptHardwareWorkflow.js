import { useCallback, useEffect, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { authorizePosDrawerOpen } from '../services/posService.js';
import { buildFnbGlobalOrderNote, buildFnbPrintContext } from '../utils/posOrderNotes.js';
import {
    createIdempotencyKey
} from '../utils/posCheckoutTerminalQueue.js';
import {
    getLineKey,
    inferReceiptContract
} from '../utils/posCheckoutTerminalUtils.js';

export const usePosReceiptHardwareWorkflow = ({
    activeShiftId = null,
    terminalUser = null,
    normalizedTerminalId = '',
    receiptSettings = {},
    lastReceipt = null,
    posHardware = null,
    safeCart = [],
    cartTotal = 0,
    orderMethod = '',
    normalizedFnbContext = null,
    tableNumber = '',
    kitchenNotes = '',
    isFnbWorkflow = false,
    setCheckoutConfirmModalOpen = () => {},
    onExternalReceiptClosed = null
} = {}) => {
    const [receiptPrinting, setReceiptPrinting] = useState(false);
    const [receiptPaperWidth, setReceiptPaperWidth] = useState('80mm');
    const [receiptPreviewModalOpen, setReceiptPreviewModalOpen] = useState(false);
    const [receiptPreviewSource, setReceiptPreviewSource] = useState('receipt_preview');
    const [externalReceiptModalActive, setExternalReceiptModalActive] = useState(false);
    const [billRequestDraft, setBillRequestDraft] = useState(null);
    const [billRequestPrinting, setBillRequestPrinting] = useState(false);
    const [drawerOpening, setDrawerOpening] = useState(false);
    const [drawerAuthorizationModalOpen, setDrawerAuthorizationModalOpen] = useState(false);
    const [drawerAuthorizationContext, setDrawerAuthorizationContext] = useState({ transactionId: null });
    const [drawerAuthorizationReason, setDrawerAuthorizationReason] = useState('');
    const [drawerAuthorizationPin, setDrawerAuthorizationPin] = useState('');
    const [drawerAuthorizationSubmitting, setDrawerAuthorizationSubmitting] = useState(false);

    const closeReceiptPreviewModal = useCallback(() => {
        setReceiptPreviewModalOpen(false);
        setReceiptPreviewSource('receipt_preview');
        if (externalReceiptModalActive) {
            setExternalReceiptModalActive(false);
            if (typeof onExternalReceiptClosed === 'function') {
                onExternalReceiptClosed();
            }
        }
    }, [externalReceiptModalActive, onExternalReceiptClosed]);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const shouldEnablePrintMode = receiptPreviewModalOpen && Boolean(lastReceipt);
        document.body.classList.toggle('pos-receipt-print-mode', shouldEnablePrintMode);
        return () => {
            document.body.classList.remove('pos-receipt-print-mode');
        };
    }, [receiptPreviewModalOpen, lastReceipt]);

    const handlePrintReceipt = useCallback(async (transaction, reason = 'manual_reprint') => {
        const transactionId = Number(transaction?.pos_transaction_id);
        if (!Number.isInteger(transactionId) || transactionId <= 0) {
            toast.error('Select a saved receipt first.');
            return;
        }

        setReceiptPrinting(true);
        try {
            // Reprinting a cash receipt must not silently pulse the drawer.
            // Cashier-initiated drawer opens go through the PIN/reason modal.
            const shouldOpenDrawer = false;
            const outcome = await posHardware.printReceipt({
                transaction,
                businessSettings: receiptSettings,
                receiptContract: inferReceiptContract(transaction),
                openDrawerAfterPrint: shouldOpenDrawer,
                shiftId: activeShiftId,
                transactionId,
                terminalId: normalizedTerminalId || undefined,
                reason,
                idempotencyKey: createIdempotencyKey()
            });

            if (outcome.success) {
                toast.success(outcome.message || 'Receipt printed.');
            } else if (outcome.reasonCode === 'NO_PRINTER_CONFIGURED') {
                toast.message(outcome.message || 'No printer is configured for this terminal. The receipt is available for on-screen preview.');
            } else {
                toast.error(outcome.message || 'Failed to send receipt to printer.');
            }
        } finally {
            setReceiptPrinting(false);
        }
    }, [activeShiftId, normalizedTerminalId, posHardware, receiptSettings]);

    const handleBillRequest = useCallback(async () => {
        if (safeCart.length === 0) {
            toast.error('Add at least one item before requesting a bill.');
            return;
        }

        const draft = {
            lines: safeCart.map((line) => ({
                lineKey: getLineKey(line),
                itemId: line.item_id,
                itemName: line.item_name,
                quantity: Number(line.quantity || 0),
                unitPrice: Number(line.sale_price || 0)
            })),
            total: Number(cartTotal || 0)
        };
        setBillRequestDraft(draft);
        setCheckoutConfirmModalOpen(false);
        setBillRequestPrinting(true);
        try {
            const outcome = await posHardware.printOrderTicket({
                cart: safeCart,
                terminalId: normalizedTerminalId,
                orderMethod,
                fnbContext: buildFnbPrintContext({
                    fnbContext: normalizedFnbContext,
                    tableNumber,
                    orderMethod
                }),
                orderNotes: isFnbWorkflow
                    ? buildFnbGlobalOrderNote({ kitchenNotes })
                    : kitchenNotes,
                billRequest: true,
                billTotal: cartTotal
            });

            if (outcome.success) {
                toast.success(outcome.message || 'Bill request sent to printer.');
            } else if (outcome.reasonCode === 'NO_PRINTER_CONFIGURED' || outcome.reasonCode === 'NOT_SUPPORTED') {
                toast.error('Bill request printing is not available on this terminal.');
            } else {
                toast.error(outcome.message || 'Failed to print bill request.');
            }
        } finally {
            setBillRequestPrinting(false);
        }
    }, [cartTotal, isFnbWorkflow, kitchenNotes, normalizedFnbContext, normalizedTerminalId, orderMethod, posHardware, safeCart, setCheckoutConfirmModalOpen, tableNumber]);

    const handlePrintOrder = useCallback(async () => {
        if (safeCart.length === 0) {
            toast.error('Add at least one item before printing an order.');
            return;
        }

        const outcome = await posHardware.printOrderTicket({
            cart: safeCart,
            terminalId: normalizedTerminalId,
            orderMethod,
            fnbContext: buildFnbPrintContext({
                fnbContext: normalizedFnbContext,
                tableNumber,
                orderMethod
            }),
            orderNotes: isFnbWorkflow
                ? buildFnbGlobalOrderNote({ kitchenNotes })
                : kitchenNotes
        });

        if (outcome.success) {
            toast.success(outcome.message || 'Order ticket sent to printer.');
        } else if (outcome.reasonCode === 'NO_PRINTER_CONFIGURED' || outcome.reasonCode === 'NOT_SUPPORTED') {
            toast.error('Order ticket printing is not available on this terminal.');
        } else {
            toast.error(outcome.message || 'Failed to print order ticket.');
        }
    }, [isFnbWorkflow, kitchenNotes, normalizedFnbContext, normalizedTerminalId, orderMethod, posHardware, safeCart, tableNumber]);

    const handleOpenDrawer = useCallback(({ transactionId = null } = {}) => {
        if (!activeShiftId) {
            toast.error('Open a shift first before opening the cash drawer.');
            return;
        }
        setDrawerAuthorizationContext({ transactionId });
        setDrawerAuthorizationReason('');
        setDrawerAuthorizationPin('');
        setDrawerAuthorizationModalOpen(true);
    }, [activeShiftId]);

    const drawerAdminBypass = terminalUser?.is_master_admin === true
        || ['admin', 'manager'].includes(String(terminalUser?.role || '').trim().toLowerCase());

    const submitDrawerAuthorization = useCallback(async () => {
        const reason = String(drawerAuthorizationReason || '').trim();
        if (reason.length < 3) {
            toast.error('Enter a reason before opening the cash drawer.');
            return;
        }
        if (!drawerAdminBypass && !/^[0-9]{4,12}$/.test(String(drawerAuthorizationPin || '').trim())) {
            toast.error('Enter your 4–12 digit POS PIN before opening the cash drawer.');
            return;
        }
        if (!activeShiftId) {
            toast.error('Open a shift first before opening the cash drawer.');
            return;
        }

        const idempotencyKey = createIdempotencyKey();
        setDrawerAuthorizationSubmitting(true);
        setDrawerOpening(true);
        try {
            const authorization = await authorizePosDrawerOpen({
                idempotency_key: idempotencyKey,
                shift_id: activeShiftId,
                transaction_id: drawerAuthorizationContext.transactionId || undefined,
                terminal_id: normalizedTerminalId || undefined,
                reason,
                authorization_pin: drawerAdminBypass ? undefined : String(drawerAuthorizationPin).trim()
            });
            const outcome = await posHardware.openDrawer({
                shiftId: activeShiftId,
                transactionId: drawerAuthorizationContext.transactionId || null,
                terminalId: normalizedTerminalId || undefined,
                reason,
                idempotencyKey,
                drawerAuthorizationToken: authorization?.authorization_token
            });

            if (outcome.success) {
                setDrawerAuthorizationModalOpen(false);
                toast.success(outcome.message || 'Cash drawer opened.');
            } else if (outcome.reasonCode === 'NO_PRINTER_CONFIGURED') {
                toast.message(outcome.message || 'No cash drawer is configured for this terminal.');
            } else {
                toast.error(outcome.message || 'Failed to open the cash drawer.');
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Cash drawer authorization failed.');
        } finally {
            setDrawerAuthorizationSubmitting(false);
            setDrawerOpening(false);
        }
    }, [activeShiftId, drawerAdminBypass, drawerAuthorizationContext.transactionId, drawerAuthorizationPin, drawerAuthorizationReason, normalizedTerminalId, posHardware]);

    return {
        receiptPrinting,
        receiptPaperWidth,
        setReceiptPaperWidth,
        receiptPreviewModalOpen,
        setReceiptPreviewModalOpen,
        receiptPreviewSource,
        setReceiptPreviewSource,
        externalReceiptModalActive,
        setExternalReceiptModalActive,
        closeReceiptPreviewModal,
        billRequestDraft,
        setBillRequestDraft,
        billRequestPrinting,
        drawerOpening,
        drawerAuthorizationModalOpen,
        setDrawerAuthorizationModalOpen,
        drawerAuthorizationContext,
        drawerAuthorizationReason,
        setDrawerAuthorizationReason,
        drawerAuthorizationPin,
        setDrawerAuthorizationPin,
        drawerAuthorizationSubmitting,
        drawerAdminBypass,
        handlePrintReceipt,
        handleBillRequest,
        handlePrintOrder,
        handleOpenDrawer,
        submitDrawerAuthorization
    };
};

export default usePosReceiptHardwareWorkflow;

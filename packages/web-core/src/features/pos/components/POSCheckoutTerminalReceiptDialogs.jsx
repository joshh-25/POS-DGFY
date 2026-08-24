import React, { Suspense } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { Receipt, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import {
    formatPosVoidTimestamp,
    isVoidedPosTransaction,
    resolvePosVoidActorLabel,
    resolvePosVoidFinancialOutcome,
    resolvePosVoidFinancialOutcomeAmount,
    resolvePosVoidFinancialOutcomeLabel,
    resolvePosVoidReason
} from '../utils/posVoidAudit.js';

const ReceiptPrintView = lazyWithChunkRetry(() => import('./ReceiptPrintView'));

const RECEIPT_PAPER_OPTIONS = [
    { value: '80mm', label: '80mm (3 1/8 in)' },
    { value: '57mm', label: '57mm (2 1/4 in)' }
];

const VoidTransactionAudit = ({ transaction }) => {
    if (!isVoidedPosTransaction(transaction)) return null;

    const financialOutcome = resolvePosVoidFinancialOutcome(transaction);
    const financialOutcomeLabel = resolvePosVoidFinancialOutcomeLabel(transaction);
    const financialOutcomeAmount = resolvePosVoidFinancialOutcomeAmount(transaction);
    const financialFollowUpRequired = financialOutcome?.refund_required === true;

    return (
        <div
            className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 print:hidden"
            data-testid="pos-void-audit-panel"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                    className="inline-flex rounded-full border border-rose-300 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700"
                    data-testid="pos-void-status-badge"
                >
                    Voided
                </span>
                <span className="text-[11px] font-semibold text-rose-700">This transaction is no longer an active sale.</span>
            </div>
            <dl className="mt-2 grid gap-1 text-[11px] leading-5 sm:grid-cols-3">
                <div><dt className="font-bold">Reason</dt><dd>{resolvePosVoidReason(transaction)}</dd></div>
                <div><dt className="font-bold">Voided by</dt><dd>{resolvePosVoidActorLabel(transaction)}</dd></div>
                <div><dt className="font-bold">Voided at</dt><dd>{formatPosVoidTimestamp(transaction.voided_at)}</dd></div>
            </dl>
            {financialOutcomeLabel && (
                <div
                    className={`mt-3 rounded-lg border px-3 py-2 ${financialFollowUpRequired
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
                    data-testid="pos-void-financial-outcome"
                >
                    <p className="text-[10px] font-black uppercase tracking-wide">Financial follow-up</p>
                    <p className="mt-1 text-[11px] leading-4">{financialOutcomeLabel}</p>
                    {financialOutcomeAmount && (
                        <p className="mt-1 text-[11px] font-bold">Amount requiring follow-up: {financialOutcomeAmount}</p>
                    )}
                </div>
            )}
        </div>
    );
};

const RefundAdjustmentAudit = ({ transaction }) => {
    const adjustments = Array.isArray(transaction?.adjustments) ? transaction.adjustments : [];
    if (adjustments.length === 0) return null;
    return (
        <div className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 print:hidden" data-testid="pos-refund-adjustment-audit">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Void and refund evidence</p>
            <div className="mt-2 space-y-2">
                {adjustments.map((adjustment) => (
                    <div key={adjustment.pos_transaction_adjustment_id || adjustment.adjustment_reference} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-black capitalize text-slate-900">{String(adjustment.adjustment_type || 'adjustment').replace(/_/g, ' ')}</span>
                            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-black uppercase tracking-wide text-slate-700">{String(adjustment.status || 'unknown').replace(/_/g, ' ')}</span>
                        </div>
                        <p className="mt-1">Reference: <span className="font-bold">{adjustment.adjustment_reference || '-'}</span></p>
                        <p>Amount: <span className="font-bold">{adjustment.currency || 'PHP'} {Number(adjustment.amount || 0).toFixed(2)}</span></p>
                        <p>Original cashier/shift: <span className="font-bold">{adjustment.original_cashier_name || adjustment.original_cashier_id || '-'} / {adjustment.original_shift_id || '-'}</span></p>
                        <p>Actioned by/shift: <span className="font-bold">{adjustment.actor_name || adjustment.actor_user_id || '-'} / {adjustment.actor_shift_id || 'No acting shift'}</span></p>
                        <p>Recorded: <span className="font-bold">{formatPosVoidTimestamp(adjustment.completed_at || adjustment.created_at)}</span></p>
                        <p>Reason: <span className="font-bold">{adjustment.reason || '-'}</span></p>
                        {adjustment.external_reference || adjustment.provider_reference ? (
                            <p>External evidence: <span className="font-bold">{adjustment.external_reference || adjustment.provider_reference}</span></p>
                        ) : null}
                        {adjustment.failure_reason ? <p className="mt-1 font-bold text-rose-700">Failure: {adjustment.failure_reason}</p> : null}
                    </div>
                ))}
            </div>
        </div>
    );
};

export function POSCheckoutTerminalReceiptDialogs({
    splitPaymentCancelModalOpen,
    splitPaymentCancelLoading,
    setSplitPaymentCancelModalOpen,
    handleKeepSplitPaymentAndClose,
    handleReverseSplitPaymentAndStartNew,
    receiptPreviewModalOpen,
    closeReceiptPreviewModal,
    receiptPreviewSource,
    lastReceiptPendingSync,
    lastReceipt,
    historyDetailLoading,
    receiptSettings,
    lastReceiptContract,
    receiptPaperWidth,
    setReceiptPaperWidth,
    setReceiptPreviewSource,
    posActionsBlocked,
    openInPosReport,
    posReportActionLabel,
    receiptPrinting,
    isPrinterAvailable,
    handlePrintReceipt,
    OrderPreviewView
}) {
    return (
        <>
            <Dialog open={splitPaymentCancelModalOpen} onOpenChange={(nextOpen) => {
                if (splitPaymentCancelLoading) return;
                setSplitPaymentCancelModalOpen(nextOpen);
            }}>
                <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full" data-testid="pos-split-payment-cancel-dialog">
                    <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                        <DialogTitle className="text-lg font-black text-slate-900">Cancel split payment?</DialogTitle>
                        <DialogDescription className="text-sm leading-5 text-slate-600">
                            This sale already has recorded payment. Keep it saved to resume later, or reverse the recorded allocations before starting a new checkout.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSplitPaymentCancelModalOpen(false)}
                            disabled={splitPaymentCancelLoading}
                            className="font-extrabold"
                        >
                            Back
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleKeepSplitPaymentAndClose}
                            disabled={splitPaymentCancelLoading}
                            className="font-extrabold text-[#1A4E8D]"
                        >
                            Keep Saved Payment
                        </Button>
                        <Button
                            type="button"
                            onClick={handleReverseSplitPaymentAndStartNew}
                            disabled={splitPaymentCancelLoading}
                            className="bg-rose-600 font-extrabold text-white hover:bg-rose-700"
                        >
                            {splitPaymentCancelLoading ? 'Reversing…' : 'Reverse & Start New'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={receiptPreviewModalOpen} onOpenChange={(open) => {
                if (!open) {
                    closeReceiptPreviewModal();
                }
            }}>
                <DialogContent className={`pos-receipt-print-dialog flex h-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 p-0 shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100dvh-3rem)] sm:w-full print:h-auto print:max-h-none print:max-w-none print:rounded-none print:border-none print:shadow-none ${
                    receiptPreviewSource === 'order_preview' ? 'max-w-3xl bg-white' : 'max-w-xl bg-slate-50'
                }`}>
                    <DialogHeader className="relative border-b border-slate-200 bg-white px-5 py-3.5 print:hidden">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                                <Receipt className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle id="pos-history-receipt-modal-title" className="text-lg font-black text-[#0F172A]">
                                    {receiptPreviewSource === 'order_preview' ? 'Order Preview' : 'Receipt Preview'}
                                </DialogTitle>
                                <DialogDescription className="mt-0.5 text-xs text-[#64748B]">
                                    {receiptPreviewSource === 'order_preview'
                                        ? (lastReceiptPendingSync
                                            ? 'Review the offline order summary. Sync the transaction before printing.'
                                            : 'Review the selected order summary.')
                                        : (lastReceiptPendingSync
                                            ? 'Review the offline receipt. Sync the transaction before printing.'
                                            : 'Review the selected receipt from history.')}
                                </DialogDescription>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={closeReceiptPreviewModal}
                            className="absolute right-5 top-1/2 -translate-y-1/2 rounded-xl border border-slate-300 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1A4E8D] focus:ring-offset-2 transition-colors"
                            aria-label="Close receipt preview"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </DialogHeader>
                    <div className="pos-receipt-print-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 print:overflow-visible print:p-0">
                        {lastReceiptPendingSync && (
                            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 print:hidden">
                                Pending sync: this is a provisional offline order record, not a final fiscal receipt.
                            </div>
                        )}
                        {lastReceipt ? (
                            receiptPreviewSource === 'order_preview' ? (
                                <div className="space-y-3 print:space-y-0">
                                    <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading order preview...</div>}>
                                        <OrderPreviewView
                                            transaction={lastReceipt}
                                            mobileResponsive
                                        />
                                    </Suspense>
                                </div>
                            ) : (
                                <>
                                    <VoidTransactionAudit transaction={lastReceipt} />
                                    <RefundAdjustmentAudit transaction={lastReceipt} />
                                    <div className="flex justify-center space-y-3 print:space-y-0">
                                        <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading receipt preview...</div>}>
                                            <div className="pos-receipt-print-paper w-full max-w-[80mm] border border-slate-200 bg-white p-4 shadow-sm">
                                                <ReceiptPrintView
                                                    transaction={lastReceipt}
                                                    businessSettings={receiptSettings}
                                                    receiptContract={lastReceiptContract}
                                                    paperWidth={receiptPaperWidth}
                                                />
                                            </div>
                                        </Suspense>
                                    </div>
                                </>
                            )
                        ) : historyDetailLoading ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                                Loading receipt details...
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50 p-6 text-center text-sm font-semibold text-rose-700">
                                Failed to load receipt details. Please try again.
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 print:hidden">
                        {receiptPreviewSource !== 'order_preview' && (
                            <label className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                                Paper
                                <select
                                    value={receiptPaperWidth}
                                    onChange={(event) => setReceiptPaperWidth(event.target.value)}
                                    className="h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#0F172A] focus:border-[#1A4E8D] focus:outline-none focus:ring-2 focus:ring-[#1A4E8D]"
                                >
                                    {RECEIPT_PAPER_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                            {lastReceipt && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setReceiptPreviewSource(
                                        receiptPreviewSource === 'order_preview' ? 'receipt_preview' : 'order_preview'
                                    )}
                                    className="h-9 rounded-lg border border-[#1A4E8D] bg-white px-4 text-xs font-bold text-[#1A4E8D] hover:bg-blue-50"
                                >
                                    {receiptPreviewSource === 'order_preview' ? 'View Receipt' : 'Back to Order'}
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                data-testid="pos-receipt-modal-open-pos-report"
                                disabled={posActionsBlocked || !lastReceipt}
                                onClick={openInPosReport}
                            >
                                {posReportActionLabel}
                            </Button>
                            <Button
                                type="button"
                                disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync || !isPrinterAvailable}
                                title={isPrinterAvailable ? undefined : 'No printer detected on this device.'}
                                onClick={() => handlePrintReceipt(lastReceipt, 'history_modal')}
                                className="h-9 rounded-lg bg-[#1A4E8D] px-4 text-xs font-bold text-white shadow-md shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {receiptPrinting ? 'Printing...' : 'Print'}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

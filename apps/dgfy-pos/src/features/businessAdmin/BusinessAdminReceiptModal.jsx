import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Receipt, ShieldAlert } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '../../../../../packages/web-core/Components/ui/dialog.jsx';
import ReceiptPrintView from '../../../../../packages/web-core/src/features/pos/components/ReceiptPrintView.jsx';
import { getAllSettings } from '../../../../../packages/web-core/src/services/settingsService.js';

const RECEIPT_SETTING_KEYS = [
    'pos_registered_name',
    'pos_business_name',
    'pos_business_style',
    'pos_taxpayer_type',
    'pos_address',
    'pos_tin_branch',
    'pos_ptu_number',
    'pos_min_number',
    'pos_accreditation_number',
    'pos_software_name',
    'pos_software_version',
    'pos_software_serial_number',
    'pos_receipt_footer_message',
    'storefront_profile_image_url'
];

const readSettingValue = (settings, key) => {
    const setting = settings?.[key];
    if (setting && typeof setting === 'object' && Object.prototype.hasOwnProperty.call(setting, 'value')) {
        return setting.value;
    }
    return setting;
};

const normalizeReceiptSettings = (settings) => RECEIPT_SETTING_KEYS.reduce((result, key) => {
    result[key] = String(readSettingValue(settings, key) || '').trim();
    return result;
}, {});

const historicalReceiptSettings = (snapshot) => {
    const seller = snapshot?.seller;
    if (!seller || typeof seller !== 'object') return null;
    return {
        pos_registered_name: String(seller.registered_name || ''),
        pos_business_name: String(seller.business_name || ''),
        pos_business_style: String(seller.business_style || ''),
        pos_taxpayer_type: String(seller.taxpayer_type || ''),
        pos_address: String(seller.address || ''),
        pos_tin_branch: String(seller.tin_branch || ''),
        pos_ptu_number: String(seller.ptu_number || ''),
        pos_min_number: String(seller.min_number || ''),
        pos_accreditation_number: String(seller.accreditation_number || ''),
        pos_software_name: String(seller.software_name || ''),
        pos_software_version: String(seller.software_version || ''),
        pos_software_serial_number: String(seller.software_serial_number || '')
    };
};

const buildHistoricalReceiptTransaction = (order) => {
    const transaction = order?.receipt?.transaction;
    if (!transaction) return null;

    const snapshot = order?.receipt?.fiscal_document_snapshot;
    if (!snapshot || typeof snapshot !== 'object') return transaction;

    const snapshotLines = Array.isArray(snapshot.lines) && snapshot.lines.length > 0
        ? snapshot.lines.map((line, index) => {
            const originalLine = transaction.lines?.[index] || {};
            const itemName = line.item_name || originalLine.item?.name || `Item #${line.item_id || originalLine.item_id || index + 1}`;
            return {
                ...originalLine,
                line_id: originalLine.line_id || `fiscal-snapshot-${index + 1}`,
                item_id: line.item_id ?? originalLine.item_id ?? null,
                item_name_snapshot: itemName,
                quantity: line.quantity ?? originalLine.quantity,
                unit_of_measure: line.unit_of_measure ?? originalLine.unit_of_measure ?? null,
                sale_price: line.sale_price ?? originalLine.sale_price,
                line_subtotal: line.line_subtotal ?? originalLine.line_subtotal,
                vat_type_snapshot: line.vat_type ?? originalLine.vat_type_snapshot ?? null,
                vat_rate_snapshot: line.vat_rate ?? originalLine.vat_rate_snapshot ?? null,
                item: {
                    ...(originalLine.item || {}),
                    item_id: line.item_id ?? originalLine.item?.item_id ?? originalLine.item_id ?? null,
                    name: itemName,
                    sku_code: originalLine.item?.sku_code || originalLine.sku_snapshot || null
                }
            };
        })
        : transaction.lines;
    const totals = snapshot.totals && typeof snapshot.totals === 'object' ? snapshot.totals : {};
    const buyer = snapshot.buyer && typeof snapshot.buyer === 'object' ? snapshot.buyer : {};

    return {
        ...transaction,
        invoice_number: snapshot.document?.invoice_number || transaction.invoice_number,
        document_type: snapshot.document?.document_type || transaction.document_type,
        document_context: snapshot.document?.document_context || transaction.document_context,
        customer_name: buyer.name ?? transaction.customer_name,
        buyer_name: buyer.name ?? transaction.buyer_name,
        buyer_tin: buyer.tin ?? transaction.buyer_tin,
        buyer_business_style: buyer.business_style ?? transaction.buyer_business_style,
        buyer_address: buyer.address ?? transaction.buyer_address,
        payment_type: totals.payment_type ?? transaction.payment_type,
        subtotal_amount: totals.subtotal_amount ?? transaction.subtotal_amount,
        vatable_sales: totals.vatable_sales ?? transaction.vatable_sales,
        vat_amount: totals.vat_amount ?? transaction.vat_amount,
        vat_exempt_sales: totals.vat_exempt_sales ?? transaction.vat_exempt_sales,
        zero_rated_sales: totals.zero_rated_sales ?? transaction.zero_rated_sales,
        discount_amount: totals.discount_amount ?? transaction.discount_amount,
        service_fee_amount: totals.service_fee_amount ?? transaction.service_fee_amount,
        restaurant_service_charge_amount: totals.restaurant_service_charge_amount ?? transaction.restaurant_service_charge_amount,
        total_amount: totals.total_amount ?? transaction.total_amount,
        lines: snapshotLines
    };
};

const resolveReceiptStatus = (order, transaction) => {
    const transactionStatus = String(order?.transaction_status || transaction?.status || '').toLowerCase();
    const paymentStatus = String(order?.payment_status || transaction?.payment_status || '').toLowerCase();
    if (transactionStatus === 'voided') return { label: 'Voided receipt', tone: 'voided', description: order?.void_reason || transaction?.void_reason || 'This transaction is no longer an active sale.' };
    if (['partial_refunded', 'refunded'].includes(paymentStatus)) return { label: 'Refund receipt', tone: 'refund', description: 'This popup shows the original sale receipt with its recorded refund evidence.' };
    return { label: 'Sales receipt', tone: 'sale', description: 'Original POS receipt from the canonical transaction record.' };
};

const ReceiptStatusBanner = ({ status }) => {
    const Icon = status.tone === 'sale' ? CheckCircle2 : ShieldAlert;
    const toneClass = status.tone === 'sale'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : status.tone === 'refund'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-rose-200 bg-rose-50 text-rose-900';
    return (
        <div className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${toneClass}`} data-testid="business-admin-receipt-status">
            <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
                <strong className="block font-black">{status.label}</strong>
                <span className="leading-5">{status.description}</span>
            </div>
        </div>
    );
};

const RefundEvidence = ({ refunds }) => {
    if (!Array.isArray(refunds) || refunds.length === 0) return null;
    return (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950" data-testid="business-admin-receipt-refund-evidence">
            <strong className="block text-[10px] uppercase tracking-wide">Refund evidence</strong>
            <div className="mt-1 space-y-1">
                {refunds.map((refund) => (
                    <div key={refund.refund_id} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                        <span>{refund.reason || 'Refund adjustment'}</span>
                        <span className="font-bold">₱{Number(refund.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {String(refund.status || 'unknown').replace(/_/g, ' ')}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function BusinessAdminReceiptModal({ order, onClose }) {
    const [receiptSettings, setReceiptSettings] = useState(null);
    const [settingsError, setSettingsError] = useState('');
    const transaction = useMemo(() => buildHistoricalReceiptTransaction(order), [order]);
    const status = useMemo(() => resolveReceiptStatus(order, transaction), [order, transaction]);
    const historicalSettings = useMemo(
        () => historicalReceiptSettings(order?.receipt?.fiscal_document_snapshot),
        [order?.receipt?.fiscal_document_snapshot]
    );
    const effectiveSettings = useMemo(
        () => ({ ...(receiptSettings || {}), ...(historicalSettings || {}) }),
        [historicalSettings, receiptSettings]
    );

    useEffect(() => {
        let cancelled = false;
        getAllSettings()
            .then((settings) => {
                if (!cancelled) setReceiptSettings(normalizeReceiptSettings(settings));
            })
            .catch(() => {
                if (!cancelled) setSettingsError('Business receipt settings could not be loaded. The stored transaction details remain available.');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!order) return null;

    const receiptNumber = order.invoice_number || transaction?.invoice_number || `Transaction #${order.transaction_id}`;
    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
            <DialogContent
                aria-labelledby="business-admin-receipt-modal-title"
                aria-describedby="business-admin-receipt-modal-description"
                className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-0 shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100dvh-3rem)] sm:w-full"
                data-testid="business-admin-receipt-modal"
            >
                <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 text-left">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D]">
                                <Receipt size={18} aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <DialogTitle id="business-admin-receipt-modal-title" autoFocus tabIndex={-1} className="truncate text-lg font-black text-slate-950">
                                    Original receipt
                                </DialogTitle>
                                <DialogDescription id="business-admin-receipt-modal-description" className="mt-1 truncate text-xs text-slate-500">
                                    {receiptNumber} · {status.label}
                                </DialogDescription>
                            </div>
                        </div>
                    </div>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
                    <ReceiptStatusBanner status={status} />
                    {settingsError && !historicalSettings ? (
                        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
                            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <span>{settingsError}</span>
                        </div>
                    ) : null}
                    {transaction ? (
                        <div className="flex justify-center">
                            <div className="w-full max-w-[80mm]">
                                <ReceiptPrintView
                                    transaction={transaction}
                                    businessSettings={effectiveSettings}
                                    receiptContract={order.receipt?.receipt_contract || null}
                                    paperWidth="80mm"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600" role="status">
                            Loading the original receipt…
                        </div>
                    )}
                    <RefundEvidence refunds={order.refunds} />
                </div>
                <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
                    <button type="button" className="business-admin-button primary" onClick={onClose}>Close</button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

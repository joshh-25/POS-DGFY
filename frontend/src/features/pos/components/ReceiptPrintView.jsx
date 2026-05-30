import React from 'react';
import { DGFY_CONVENIENCE_FEE_LABEL } from '../utils/checkoutSurfaceContract.js';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const DGFY_BRAND_NAME = 'DGFY';
const DGFY_ACRONYM = 'Discover Goods For You';

const parseTransactionMetadata = (value) => {
    if (!value) return {};
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        return {};
    }
    return {};
};

const parseArrayMetadata = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const resolveDocumentType = ({ transaction, receiptContract }) => {
    const contractType = String(receiptContract?.document_type || '').toLowerCase();
    if (contractType === 'fiscal_invoice' || contractType === 'non_fiscal_slip') {
        return contractType;
    }

    const stored = String(transaction?.document_type || '').toLowerCase();
    if (stored === 'fiscal_invoice' || stored === 'non_fiscal_slip') {
        return stored;
    }

    const invoiceNumber = String(transaction?.invoice_number || '').toUpperCase();
    if (invoiceNumber.startsWith('INV-')) return 'fiscal_invoice';
    return 'non_fiscal_slip';
};

const resolveDocumentContext = ({ transaction, receiptContract, documentType }) => {
    const contractContext = String(receiptContract?.document_context || '').trim().toLowerCase();
    if (['fiscal', 'non_fiscal', 'training_test'].includes(contractContext)) {
        return contractContext;
    }

    const persistedContext = String(transaction?.document_context || '').trim().toLowerCase();
    if (['fiscal', 'non_fiscal', 'training_test'].includes(persistedContext)) {
        return persistedContext;
    }

    return documentType === 'fiscal_invoice' ? 'fiscal' : 'non_fiscal';
};

export default function ReceiptPrintView({ transaction, businessSettings = {}, receiptContract = null }) {
    if (!transaction) return null;

    const printedAt = transaction.created_at
        ? new Date(transaction.created_at).toLocaleString()
        : '-';
    const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
    const documentType = resolveDocumentType({ transaction, receiptContract });
    const documentContext = resolveDocumentContext({ transaction, receiptContract, documentType });
    const transactionMetadata = parseTransactionMetadata(transaction?.special_instructions);
    const contractMetadata = transactionMetadata?.receipt_contract
        && typeof transactionMetadata.receipt_contract === 'object'
        ? transactionMetadata.receipt_contract
        : {};
    const receiptContractVersion = String(contractMetadata?.version || '').trim() || '2026.04.08';
    const isFiscal = documentType === 'fiscal_invoice';
    const isTrainingContext = documentContext === 'training_test';
    const documentLabel = isFiscal ? 'FISCAL INVOICE' : 'NON-FISCAL SLIP';
    const restaurantServiceChargeAmount = Number(transaction.restaurant_service_charge_amount || 0);

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 print:border-none print:rounded-none print:p-0">
            <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                <p className="font-semibold text-slate-900">{businessSettings.pos_business_name || DGFY_BRAND_NAME}</p>
                {businessSettings.pos_business_name && (
                    <p className="text-xs text-slate-600">Brand: {DGFY_BRAND_NAME}</p>
                )}
                {isFiscal && businessSettings.pos_tin_branch && (
                    <p className="text-xs text-slate-600">TIN/Branch: {businessSettings.pos_tin_branch}</p>
                )}
                {businessSettings.pos_address && (
                    <p className="text-xs text-slate-600">{businessSettings.pos_address}</p>
                )}
                {isFiscal && (
                    <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                        {businessSettings.pos_ptu_number && <p>PTU: {businessSettings.pos_ptu_number}</p>}
                        {businessSettings.pos_min_number && <p>MIN: {businessSettings.pos_min_number}</p>}
                        {businessSettings.pos_accreditation_number && <p>Accreditation: {businessSettings.pos_accreditation_number}</p>}
                    </div>
                )}
                <h3 className="font-semibold text-slate-900 mt-2">{documentLabel}</h3>
                {!isFiscal && (
                    <div className={`mt-1 rounded-md border px-2 py-1 text-[11px] uppercase tracking-wide ${isTrainingContext ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        <p className="font-semibold">NOT A FISCAL RECEIPT</p>
                        <p>{isTrainingContext ? 'Training/Test mode only' : 'Non-fiscal document'}</p>
                    </div>
                )}
                <p className="text-xs text-slate-500">{transaction.invoice_number}</p>
                <p className="text-xs text-slate-500">{printedAt}</p>
                {(transaction.fnb_check_id || transaction.fnb_table_label_snapshot || transaction.fnb_guest_count) && (
                    <p className="text-xs text-slate-500">
                         F&B Check{transaction.fnb_check_id ? ` #${transaction.fnb_check_id}` : ''}
                        {transaction.fnb_table_label_snapshot ? ` Table ${transaction.fnb_table_label_snapshot}` : ''}
                        {transaction.fnb_guest_count ? ` Guests ${transaction.fnb_guest_count}` : ''}
                    </p>
                )}
            </div>

            <div className="space-y-2 text-sm mb-4">
                {lines.map((line) => {
                    const modifiers = parseArrayMetadata(line.fnb_modifiers_snapshot);
                    return (
                        <div key={line.line_id} className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-medium text-slate-900">{line.item?.name || `Item #${line.item_id}`}</p>
                                <p className="text-xs text-slate-500">
                                    {Number(line.quantity).toFixed(2)} {line.unit_of_measure || ''} x {money(line.sale_price)}
                                </p>
                                {(line.fnb_course_snapshot || modifiers.length || line.fnb_special_instructions) && (
                                    <p className="text-xs text-slate-500">
                                        {line.fnb_course_snapshot ? `Course: ${line.fnb_course_snapshot}` : ''}
                                        {modifiers.length ? ` Modifiers: ${modifiers.map((modifier) => modifier.option_name || modifier.name).filter(Boolean).join(', ')}` : ''}
                                        {line.fnb_special_instructions ? ` Notes: ${line.fnb_special_instructions}` : ''}
                                    </p>
                                )}
                            </div>
                            <p className="font-medium text-slate-900">{money(line.line_subtotal)}</p>
                        </div>
                    );
                })}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>{money(transaction.subtotal_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>Vatable Sales</span>
                    <span>{money(transaction.vatable_sales)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>VAT Amount</span>
                    <span>{money(transaction.vat_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>VAT Exempt Sales</span>
                    <span>{money(transaction.vat_exempt_sales)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>Zero Rated Sales</span>
                    <span>{money(transaction.zero_rated_sales)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>
                        Discount
                        {transaction.discount_label_snapshot ? ` (${transaction.discount_label_snapshot})` : ''}
                        {transaction.discount_rate_snapshot != null ? ` @ ${Number(transaction.discount_rate_snapshot).toFixed(2)}%` : ''}
                    </span>
                    <span>{money(transaction.discount_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                    <span>
                        {transaction.service_fee_label_snapshot || DGFY_CONVENIENCE_FEE_LABEL}
                        {transaction.service_fee_method_snapshot ? ` (${transaction.service_fee_method_snapshot})` : ''}
                    </span>
                    <span>{money(transaction.service_fee_amount)}</span>
                </div>
                {restaurantServiceChargeAmount > 0 && (
                    <div className="flex justify-between text-slate-600">
                        <span>
                            {transaction.restaurant_service_charge_label_snapshot || 'Restaurant service charge'}
                            {transaction.restaurant_service_charge_rate_snapshot != null ? ` @ ${Number(transaction.restaurant_service_charge_rate_snapshot).toFixed(2)}%` : ''}
                        </span>
                        <span>{money(restaurantServiceChargeAmount)}</span>
                    </div>
                )}
                <div className="flex justify-between text-base font-semibold text-slate-900 pt-1">
                    <span>Total</span>
                    <span>{money(transaction.total_amount)}</span>
                </div>
            </div>
            <div className="text-center text-xs text-slate-500 mt-3 pt-3 border-t border-dashed border-slate-300 space-y-0.5">
                <p>Document context: {documentContext}</p>
                <p>Receipt contract version: {receiptContractVersion}</p>
                <p>Sequence control: invoice number is system-generated and immutable.</p>
                {businessSettings.pos_receipt_footer_message && (
                    <p>{businessSettings.pos_receipt_footer_message}</p>
                )}
                <p>{DGFY_ACRONYM}</p>
            </div>
        </div>
    );
}

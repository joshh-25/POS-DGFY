import React from 'react';
import {
    DGFY_CONVENIENCE_FEE_LABEL,
    resolveReceiptDocumentContract
} from '../utils/checkoutSurfaceContract.js';

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

export default function ReceiptPrintView({ transaction, businessSettings = {}, receiptContract = null }) {
    if (!transaction) return null;

    const printedAt = transaction.created_at
        ? new Date(transaction.created_at).toLocaleString()
        : '-';
    const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
    const resolvedReceiptContract = resolveReceiptDocumentContract(transaction, receiptContract);
    const documentType = resolvedReceiptContract.document_type;
    const documentContext = resolvedReceiptContract.document_context;
    const transactionMetadata = parseTransactionMetadata(transaction?.special_instructions);
    const fiscalSnapshot = parseTransactionMetadata(transaction?.fiscal_document_snapshot);
    const fiscalSeller = fiscalSnapshot?.seller && typeof fiscalSnapshot.seller === 'object'
        ? fiscalSnapshot.seller
        : {};
    const fiscalBuyer = fiscalSnapshot?.buyer && typeof fiscalSnapshot.buyer === 'object'
        ? fiscalSnapshot.buyer
        : {};
    const contractMetadata = transactionMetadata?.receipt_contract
        && typeof transactionMetadata.receipt_contract === 'object'
        ? transactionMetadata.receipt_contract
        : {};
    const receiptContractVersion = String(
        fiscalSnapshot?.document?.receipt_contract_version || contractMetadata?.version || ''
    ).trim() || '2026.04.08';
    const isFiscal = documentType === 'fiscal_invoice';
    const isTrainingContext = documentContext === 'training_test';
    const documentLabel = isFiscal ? 'FISCAL INVOICE' : 'NON-FISCAL SLIP';
    const restaurantServiceChargeAmount = Number(transaction.restaurant_service_charge_amount || 0);
    const fiscalPrintCount = Array.isArray(transaction.fiscalPrintEvents)
        ? transaction.fiscalPrintEvents.length
        : 0;
    const reprintCount = Math.max(Number(transaction.fiscal_reprint_count || 0), Math.max(0, fiscalPrintCount - 1));
    const sellerName = isFiscal
        ? (fiscalSeller.registered_name || fiscalSeller.business_name || businessSettings.pos_registered_name || businessSettings.pos_business_name)
        : businessSettings.pos_business_name;
    const sellerTinBranch = fiscalSeller.tin_branch || businessSettings.pos_tin_branch;
    const sellerAddress = fiscalSeller.address || businessSettings.pos_address;
    const sellerPtuNumber = fiscalSeller.ptu_number || businessSettings.pos_ptu_number;
    const sellerMinNumber = fiscalSeller.min_number || businessSettings.pos_min_number;
    const sellerAccreditationNumber = fiscalSeller.accreditation_number || businessSettings.pos_accreditation_number;
    const sellerSoftwareIdentity = [
        fiscalSeller.software_name,
        fiscalSeller.software_version,
        fiscalSeller.software_serial_number
    ].filter(Boolean).join(' / ');

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 print:border-none print:rounded-none print:p-0">
            <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                <p className="font-semibold text-slate-900">{sellerName || DGFY_BRAND_NAME}</p>
                {sellerName && (
                    <p className="text-xs text-slate-600">Brand: {DGFY_BRAND_NAME}</p>
                )}
                {isFiscal && sellerTinBranch && (
                    <p className="text-xs text-slate-600">TIN/Branch: {sellerTinBranch}</p>
                )}
                {sellerAddress && (
                    <p className="text-xs text-slate-600">{sellerAddress}</p>
                )}
                {isFiscal && (
                    <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                        {sellerPtuNumber && <p>PTU: {sellerPtuNumber}</p>}
                        {sellerMinNumber && <p>MIN: {sellerMinNumber}</p>}
                        {sellerAccreditationNumber && <p>Accreditation: {sellerAccreditationNumber}</p>}
                        {sellerSoftwareIdentity && <p>Software: {sellerSoftwareIdentity}</p>}
                    </div>
                )}
                <h3 className="font-semibold text-slate-900 mt-2">{documentLabel}</h3>
                {isFiscal && reprintCount > 0 && (
                    <p className="mt-1 text-xs font-semibold text-slate-700">REPRINT #{reprintCount}</p>
                )}
                {isFiscal && transaction.fiscal_lifecycle_state === 'voided' && (
                    <p className="mt-1 text-xs font-semibold text-red-700">VOIDED</p>
                )}
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
            {isFiscal && (fiscalBuyer.name || fiscalBuyer.tin || fiscalBuyer.business_style || fiscalBuyer.address) && (
                <div className="mb-3 border-b border-dashed border-slate-300 pb-3 text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">Buyer</p>
                    {fiscalBuyer.name && <p>{fiscalBuyer.name}</p>}
                    {fiscalBuyer.tin && <p>TIN: {fiscalBuyer.tin}</p>}
                    {fiscalBuyer.business_style && <p>Business style: {fiscalBuyer.business_style}</p>}
                    {fiscalBuyer.address && <p>{fiscalBuyer.address}</p>}
                </div>
            )}

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
                {transaction.fiscal_document_hash && (
                    <p>Fiscal document hash: {String(transaction.fiscal_document_hash).slice(0, 12)}</p>
                )}
                <p>Sequence control: invoice number is system-generated and immutable.</p>
                {businessSettings.pos_receipt_footer_message && (
                    <p>{businessSettings.pos_receipt_footer_message}</p>
                )}
                <p>{DGFY_ACRONYM}</p>
            </div>
        </div>
    );
}

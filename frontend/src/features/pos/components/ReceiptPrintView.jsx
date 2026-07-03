import React from 'react';
import resolveAssetUrl from '@/src/utils/assetUrl.js';

const money = (value) => Number(value || 0).toFixed(2);
const DGFY_BRAND_NAME = 'DGFY';
const DGFY_CONVENIENCE_FEE_LABEL = 'DGFY convenience fee';
const DGFY_ACRONYM = 'Discover Goods For You';
const RECEIPT_LINE_GRID_COLUMNS = 'minmax(0, 1fr) 3.25rem 1.25rem 3.25rem';
const RECEIPT_LINE_GRID_COLUMNS_57MM = 'minmax(0, 1fr) 2.45rem 1.05rem 2.45rem';
const RECEIPT_PAPER_WIDTHS = {
    '80mm': '80mm',
    '57mm': '57mm'
};

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

const resolveReceiptLineQuantity = (line) => {
    const quantity = Number(line?.quantity ?? line?.qty ?? 0);
    return Number.isFinite(quantity) ? quantity : 0;
};

const resolveReceiptLineUnitPrice = (line) => {
    const explicitPrice = Number(line?.sale_price ?? line?.unit_price ?? line?.price);
    if (Number.isFinite(explicitPrice)) return explicitPrice;

    const quantity = resolveReceiptLineQuantity(line);
    const lineTotal = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? line?.amount);
    if (!Number.isFinite(lineTotal)) return 0;
    return quantity > 0 ? lineTotal / quantity : lineTotal;
};

const resolveReceiptLineTotal = (line) => {
    const explicitTotal = Number(line?.line_subtotal ?? line?.line_total ?? line?.total_amount ?? line?.amount);
    if (Number.isFinite(explicitTotal)) return explicitTotal;
    return resolveReceiptLineQuantity(line) * resolveReceiptLineUnitPrice(line);
};

const formatReceiptQuantity = (value) => {
    const quantity = Number(value || 0);
    if (!Number.isFinite(quantity)) return '0';
    return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
};

const splitReceiptItemName = (value) => {
    const name = String(value || '').trim().replace(/\s+/g, ' ');
    const [firstWord = '', ...remainingWords] = name.split(' ');
    return {
        firstLine: firstWord || name,
        secondLine: remainingWords.join(' ')
    };
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

export default function ReceiptPrintView({ transaction, businessSettings = {}, receiptContract = null, paperWidth = '80mm' }) {
    if (!transaction) return null;

    const printedAt = transaction.created_at
        ? new Date(transaction.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
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
    const taxpayerType = String(businessSettings.pos_taxpayer_type || '').trim().toLowerCase();
    const isVatRegistered = !taxpayerType.includes('non');
    const documentLabel = isFiscal ? (isVatRegistered ? 'VAT INVOICE' : 'NON-VAT INVOICE') : 'NON-FISCAL SLIP';
    const restaurantServiceChargeAmount = Number(transaction.restaurant_service_charge_amount || 0);
    const governedDiscount = transaction.discount && typeof transaction.discount === 'object' ? transaction.discount : null;
    const businessName = String(businessSettings.pos_business_name || '').trim();
    const registeredName = String(businessSettings.pos_registered_name || '').trim();
    const shouldShowBusinessName = businessName && businessName.toLowerCase() !== DGFY_BRAND_NAME.toLowerCase();
    const businessIconUrl = String(
        businessSettings.storefront_profile_image_url
        || businessSettings.profile_image_url
        || ''
    ).trim();
    const resolvedBusinessIconUrl = businessIconUrl ? resolveAssetUrl(businessIconUrl) : '';
    const resolvedPaperWidth = RECEIPT_PAPER_WIDTHS[paperWidth] || RECEIPT_PAPER_WIDTHS['80mm'];
    const receiptLineGridColumns = resolvedPaperWidth === '57mm'
        ? RECEIPT_LINE_GRID_COLUMNS_57MM
        : RECEIPT_LINE_GRID_COLUMNS;

    return (
        <div
            className="pos-thermal-receipt mx-auto box-border bg-white border border-slate-200 rounded-lg p-3 font-mono text-[11px] leading-[1.22] text-slate-900 shadow-sm print:border-none print:rounded-none print:p-0 print:text-[10px] print:leading-[1.18] print:shadow-none"
            data-paper-width={resolvedPaperWidth}
            style={{ width: resolvedPaperWidth, maxWidth: '100%' }}
        >
            <div className="mb-2 border-b border-dashed border-slate-300 pb-2 text-center print:mb-1.5 print:pb-1.5">
                {resolvedBusinessIconUrl ? (
                    <img
                        src={resolvedBusinessIconUrl}
                        alt={businessName ? `${businessName} icon` : 'Business icon'}
                        className="mx-auto mb-1.5 h-auto w-20 object-contain print:w-16"
                    />
                ) : null}
                {registeredName && <p className="text-[11px] font-bold uppercase tracking-tight text-slate-950 print:text-[10px]">{registeredName}</p>}
                {shouldShowBusinessName && <p className="text-[10px] font-semibold uppercase tracking-tight text-slate-900 print:text-[9px]">{businessName}</p>}
                {businessSettings.pos_address && (
                    <p className="text-[9px] leading-snug text-slate-600 print:text-[8px]">{businessSettings.pos_address}</p>
                )}
                {businessSettings.pos_tin_branch && <p className="text-[9px] font-semibold text-slate-700 print:text-[8px]">{isVatRegistered ? 'VAT REG TIN' : 'NON-VAT REG TIN'}: {businessSettings.pos_tin_branch}</p>}
                <h3 className="mt-1.5 text-[12px] font-bold tracking-wide text-slate-950 print:mt-1 print:text-[11px]">{documentLabel}</h3>
                {!isFiscal && (
                    <div className={`mt-1 rounded border px-1.5 py-0.5 text-[9px] uppercase leading-tight tracking-wide print:px-1 print:py-0.5 print:text-[8px] ${isTrainingContext ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        <p className="font-semibold">NOT A FISCAL RECEIPT</p>
                        <p>{isTrainingContext ? 'Training/Test mode only' : 'Non-fiscal document'}</p>
                    </div>
                )}
                <div className="mt-2 space-y-0.5 text-left text-[10px] text-slate-700 print:mt-1.5 print:text-[9px]">
                    <p className="flex justify-between gap-2"><span>Invoice No.</span><span className="text-right">{transaction.invoice_number || '-'}</span></p>
                    <p className="flex justify-between gap-2"><span>Date/Time</span><span className="text-right">{printedAt}</span></p>
                    <p className="flex justify-between gap-2"><span>Terminal</span><span className="text-right">{transaction.terminal_id || '-'}</span></p>
                    <p className="flex justify-between gap-2"><span>Cashier</span><span className="text-right">{transaction.cashier?.username || transaction.acceptedByUser?.username || '-'}</span></p>
                </div>
                {(transaction.fnb_check_id || transaction.fnb_table_label_snapshot || transaction.fnb_guest_count) && (
                    <p className="mt-1 text-center text-[10px] text-slate-500 print:text-[9px]">
                         F&B Check{transaction.fnb_check_id ? ` #${transaction.fnb_check_id}` : ''}
                        {transaction.fnb_table_label_snapshot ? ` Table ${transaction.fnb_table_label_snapshot}` : ''}
                        {transaction.fnb_guest_count ? ` Guests ${transaction.fnb_guest_count}` : ''}
                    </p>
                )}
            </div>

            <div className="mb-2 border-b border-dashed border-slate-300 pb-2 text-[10px] leading-snug text-slate-700 print:mb-1.5 print:pb-1.5 print:text-[9px]">
                <p className="mb-0.5 font-bold">SOLD TO:</p>
                <p>Customer/Registered Name: {transaction.customer_name || transaction.buyer_name || '________________'}</p>
                <p>TIN: {transaction.buyer_tin || '________________'}</p>
                <p>Business Address: {transaction.buyer_address || '____________________'}</p>
            </div>

            <div className="mb-2 space-y-1.5 text-[11px] print:mb-2 print:space-y-1 print:text-[10px]">
                {lines.length > 0 && (
                    <div
                        className="grid gap-1 border-b border-dashed border-slate-300 pb-1 text-[8px] font-semibold uppercase text-slate-500 print:text-[7px]"
                        style={{ gridTemplateColumns: receiptLineGridColumns }}
                    >
                        <span>Item</span>
                        <span className="text-right">Unit Price</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Line</span>
                    </div>
                )}
                {lines.map((line) => {
                    const modifiers = parseArrayMetadata(line.fnb_modifiers_snapshot);
                    const quantity = resolveReceiptLineQuantity(line);
                    const unitPrice = resolveReceiptLineUnitPrice(line);
                    const lineTotal = resolveReceiptLineTotal(line);
                    const itemNameParts = splitReceiptItemName(line.item?.name || `Item #${line.item_id}`);
                    return (
                        <div
                            key={line.line_id}
                            className="border-b border-dashed border-slate-200 pb-1.5 last:border-b-0 last:pb-0 print:pb-1"
                        >
                            <div
                                className="grid gap-1 text-[10px] print:text-[9px]"
                                style={{ gridTemplateColumns: receiptLineGridColumns }}
                            >
                                <p className="min-w-0 truncate font-medium leading-snug text-slate-900">{itemNameParts.firstLine}</p>
                                <p className="whitespace-nowrap text-right tabular-nums text-slate-700">{money(unitPrice)}</p>
                                <p className="whitespace-nowrap text-right tabular-nums text-slate-700">{formatReceiptQuantity(quantity)}</p>
                                <p className="whitespace-nowrap text-right font-medium tabular-nums text-slate-900">{money(lineTotal)}</p>
                            </div>
                            {itemNameParts.secondLine && (
                                <p className="line-clamp-1 min-w-0 whitespace-normal break-words pr-16 text-[10px] font-medium leading-snug text-slate-900 print:pr-14 print:text-[9px]">
                                    {itemNameParts.secondLine}
                                </p>
                            )}
                            {(modifiers.length || line.fnb_special_instructions) && (
                                <p className="mt-0.5 text-[9px] leading-snug text-slate-500 print:text-[8px]">
                                    {modifiers.length ? `Modifiers: ${modifiers.map((modifier) => modifier.option_name || modifier.name).filter(Boolean).join(', ')}` : ''}
                                    {line.fnb_special_instructions ? ` Notes: ${line.fnb_special_instructions}` : ''}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="space-y-0.5 border-t border-dashed border-slate-300 pt-2 text-[10px] print:pt-1.5 print:text-[9px]">
                <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1 font-semibold">TOTAL SALES</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.subtotal_amount)}</span>
                </div>
                {governedDiscount && <>
                    {Number(governedDiscount.vat_removed || 0) > 0 && <div className="flex justify-between gap-2 text-slate-600"><span>VAT Removed</span><span>{money(governedDiscount.vat_removed)}</span></div>}
                    {Number(governedDiscount.vat_exempt_amount || 0) > 0 && <div className="flex justify-between gap-2 text-slate-600"><span>VAT-Exempt Amount</span><span>{money(governedDiscount.vat_exempt_amount)}</span></div>}
                    {governedDiscount.customer_name && <div className="flex justify-between gap-2 text-slate-600"><span>Customer</span><span className="text-right">{governedDiscount.customer_name}</span></div>}
                    {governedDiscount.senior_pwd_id_number && <div className="flex justify-between gap-2 text-slate-600"><span>Senior/PWD ID</span><span className="text-right">{governedDiscount.senior_pwd_id_number}</span></div>}
                    {governedDiscount.employee_name && <div className="flex justify-between gap-2 text-slate-600"><span>Employee</span><span className="text-right">{governedDiscount.employee_name}</span></div>}
                    {governedDiscount.employee_id && <div className="flex justify-between gap-2 text-slate-600"><span>Employee ID</span><span className="text-right">{governedDiscount.employee_id}</span></div>}
                    {governedDiscount.reason && <div className="flex justify-between gap-2 text-slate-600"><span>Reason</span><span className="text-right">{governedDiscount.reason}</span></div>}
                </>}
                <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">Vatable Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vatable_sales)}</span>
                </div>
                <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">VAT Amount</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vat_amount)}</span>
                </div>
                <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">VAT Exempt Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vat_exempt_sales)}</span>
                </div>
                <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">Zero Rated Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.zero_rated_sales)}</span>
                </div>
                <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">
                        Discount
                        {transaction.discount_label_snapshot ? ` (${transaction.discount_label_snapshot})` : ''}
                        {transaction.discount_rate_snapshot != null ? ` @ ${Number(transaction.discount_rate_snapshot).toFixed(2)}%` : ''}
                    </span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.discount_amount)}</span>
                </div>
                <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">
                        {transaction.service_fee_label_snapshot || DGFY_CONVENIENCE_FEE_LABEL}
                        {transaction.service_fee_method_snapshot ? ` (${transaction.service_fee_method_snapshot})` : ''}
                    </span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.service_fee_amount)}</span>
                </div>
                {restaurantServiceChargeAmount > 0 && (
                    <div className="flex items-start justify-between gap-2 text-slate-600">
                        <span className="min-w-0 flex-1">
                            {transaction.restaurant_service_charge_label_snapshot || 'Restaurant service charge'}
                            {transaction.restaurant_service_charge_rate_snapshot != null ? ` @ ${Number(transaction.restaurant_service_charge_rate_snapshot).toFixed(2)}%` : ''}
                        </span>
                        <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(restaurantServiceChargeAmount)}</span>
                    </div>
                )}
                <div className="mt-1 flex items-start justify-between gap-2 border-t border-slate-300 pt-1 text-[12px] font-bold text-slate-950 print:text-[11px]">
                    <span className="min-w-0 flex-1">TOTAL AMOUNT DUE</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.total_amount)}</span>
                </div>
            </div>
            <div className="mt-2 border-t border-dashed border-slate-300 pt-2 text-[10px] leading-snug text-slate-700 print:mt-1.5 print:pt-1.5 print:text-[9px]">
                <p className="flex justify-between gap-2"><span>Payment Method:</span><span>{String(transaction.payment_type || '').replaceAll('_', ' ').toUpperCase()}</span></p>
                <p className="flex justify-between gap-2"><span>Cash Received:</span><span>{money(transaction.cash_received)}</span></p>
                <p className="flex justify-between gap-2"><span>Change:</span><span>{money(transaction.change_amount)}</span></p>
                <div className="mt-2">
                    <p>SC/PWD/NAAC/MOV/Solo Parent ID No.: {governedDiscount?.senior_pwd_id_number || '____________'}</p>
                    <p>Signature: __________________________</p>
                </div>
                <div className="mt-2 border-t border-dashed border-slate-300 pt-2">
                    <p>BIR Permit No.: {businessSettings.pos_ptu_number || '-'}</p>
                    <p>ATP/OCN No.: {businessSettings.pos_accreditation_number || '-'}</p>
                    <p>MIN: {businessSettings.pos_min_number || '-'}</p>
                </div>
            </div>
            <div className="mt-2 space-y-0.5 border-t border-dashed border-slate-300 pt-2 text-center text-[9px] leading-snug text-slate-500 print:mt-1.5 print:pt-1.5 print:text-[8px]">
                {businessSettings.pos_receipt_footer_message && (
                    <p>{businessSettings.pos_receipt_footer_message}</p>
                )}
                <p>Thank you. Please come again.</p>
                <p className="font-semibold text-slate-700">Powered by DGFY POS</p>
            </div>
        </div>
    );
}

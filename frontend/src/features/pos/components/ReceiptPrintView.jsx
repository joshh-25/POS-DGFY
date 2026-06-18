import React from 'react';

const money = (value) => Number(value || 0).toFixed(2);
const DGFY_BRAND_NAME = 'DGFY';
const DGFY_CONVENIENCE_FEE_LABEL = 'DGFY convenience fee';
const DGFY_ACRONYM = 'Discover Goods For You';
const DGFY_RECEIPT_LOGO_SRC = './dgfy-logo.png';
const RECEIPT_LINE_GRID_COLUMNS = 'minmax(0, 1fr) 3.75rem 1.5rem 3.75rem';
const RECEIPT_LINE_GRID_COLUMNS_57MM = 'minmax(0, 1fr) 2.75rem 1.25rem 2.75rem';
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
    const businessName = String(businessSettings.pos_business_name || '').trim();
    const shouldShowBusinessName = businessName && businessName.toLowerCase() !== DGFY_BRAND_NAME.toLowerCase();
    const resolvedPaperWidth = RECEIPT_PAPER_WIDTHS[paperWidth] || RECEIPT_PAPER_WIDTHS['80mm'];
    const receiptLineGridColumns = resolvedPaperWidth === '57mm'
        ? RECEIPT_LINE_GRID_COLUMNS_57MM
        : RECEIPT_LINE_GRID_COLUMNS;

    return (
        <div
            className="pos-thermal-receipt mx-auto box-border bg-white border border-slate-200 rounded-xl p-4 text-[13px] leading-[1.3] print:border-none print:rounded-none print:p-0 print:text-[11px] print:leading-[1.25]"
            data-paper-width={resolvedPaperWidth}
            style={{ width: resolvedPaperWidth, maxWidth: '100%' }}
        >
            <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3 print:pb-2 print:mb-2">
                <img
                    src={DGFY_RECEIPT_LOGO_SRC}
                    alt="DGFY"
                    className="mx-auto mb-2 h-auto w-28 object-contain print:w-24"
                />
                {shouldShowBusinessName && (
                    <p className="font-semibold text-slate-900">{businessName}</p>
                )}
                {isFiscal && businessSettings.pos_tin_branch && (
                    <p className="text-xs text-slate-600 print:text-[10px]">TIN/Branch: {businessSettings.pos_tin_branch}</p>
                )}
                {businessSettings.pos_address && (
                    <p className="text-xs text-slate-600 print:text-[10px]">{businessSettings.pos_address}</p>
                )}
                {isFiscal && (
                    <div className="text-xs text-slate-500 mt-1 space-y-0.5 print:text-[10px]">
                        {businessSettings.pos_ptu_number && <p>PTU: {businessSettings.pos_ptu_number}</p>}
                        {businessSettings.pos_min_number && <p>MIN: {businessSettings.pos_min_number}</p>}
                        {businessSettings.pos_accreditation_number && <p>Accreditation: {businessSettings.pos_accreditation_number}</p>}
                        {businessSettings.pos_software_name && <p>Software: {businessSettings.pos_software_name}</p>}
                        {businessSettings.pos_software_version && <p>Version: {businessSettings.pos_software_version}</p>}
                        {businessSettings.pos_software_serial_number && <p>Serial: {businessSettings.pos_software_serial_number}</p>}
                    </div>
                )}
                <h3 className="font-semibold text-slate-900 mt-2 print:mt-1 print:text-[12px]">{documentLabel}</h3>
                {!isFiscal && (
                    <div className={`mt-1 rounded-md border px-2 py-1 text-[11px] uppercase tracking-wide print:px-1.5 print:py-1 print:text-[9px] ${isTrainingContext ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        <p className="font-semibold">NOT A FISCAL RECEIPT</p>
                        <p>{isTrainingContext ? 'Training/Test mode only' : 'Non-fiscal document'}</p>
                    </div>
                )}
                <p className="text-xs text-slate-500 print:text-[10px]">{transaction.invoice_number}</p>
                <p className="text-xs text-slate-500 print:text-[10px]">{printedAt}</p>
                {(transaction.fnb_check_id || transaction.fnb_table_label_snapshot || transaction.fnb_guest_count) && (
                    <p className="text-xs text-slate-500 print:text-[10px]">
                         F&B Check{transaction.fnb_check_id ? ` #${transaction.fnb_check_id}` : ''}
                        {transaction.fnb_table_label_snapshot ? ` Table ${transaction.fnb_table_label_snapshot}` : ''}
                        {transaction.fnb_guest_count ? ` Guests ${transaction.fnb_guest_count}` : ''}
                    </p>
                )}
            </div>

            <div className="space-y-2 text-sm mb-4 print:space-y-1.5 print:mb-3 print:text-[11px]">
                {lines.length > 0 && (
                    <div
                        className="grid gap-1.5 border-b border-dashed border-slate-300 pb-1 text-[10px] font-semibold uppercase text-slate-500 print:gap-1 print:text-[8px]"
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
                            className="border-b border-dashed border-slate-200 pb-2 last:border-b-0 last:pb-0 print:pb-1.5"
                        >
                            <div
                                className="grid gap-1.5 text-[13px] print:gap-1 print:text-[10px]"
                                style={{ gridTemplateColumns: receiptLineGridColumns }}
                            >
                                <p className="min-w-0 truncate font-medium leading-snug text-slate-900">{itemNameParts.firstLine}</p>
                                <p className="whitespace-nowrap text-right tabular-nums text-slate-700">{money(unitPrice)}</p>
                                <p className="whitespace-nowrap text-right tabular-nums text-slate-700">{formatReceiptQuantity(quantity)}</p>
                                <p className="whitespace-nowrap text-right font-medium tabular-nums text-slate-900">{money(lineTotal)}</p>
                            </div>
                            {itemNameParts.secondLine && (
                                <p className="line-clamp-1 min-w-0 whitespace-normal break-words pr-24 text-[13px] font-medium leading-snug text-slate-900 print:pr-20 print:text-[10px]">
                                    {itemNameParts.secondLine}
                                </p>
                            )}
                            {(modifiers.length || line.fnb_special_instructions) && (
                                <p className="mt-0.5 text-xs text-slate-500 print:text-[10px]">
                                    {modifiers.length ? `Modifiers: ${modifiers.map((modifier) => modifier.option_name || modifier.name).filter(Boolean).join(', ')}` : ''}
                                    {line.fnb_special_instructions ? ` Notes: ${line.fnb_special_instructions}` : ''}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 text-sm space-y-1 print:pt-2 print:text-[11px]">
                <div className="flex items-start justify-between gap-3 text-slate-600 print:gap-2">
                    <span className="min-w-0 flex-1">Subtotal</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.subtotal_amount)}</span>
                </div>
                <div className="flex items-start justify-between gap-3 text-slate-600 print:gap-2">
                    <span className="min-w-0 flex-1">Vatable Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vatable_sales)}</span>
                </div>
                <div className="flex items-start justify-between gap-3 text-slate-600 print:gap-2">
                    <span className="min-w-0 flex-1">VAT Amount</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vat_amount)}</span>
                </div>
                <div className="flex items-start justify-between gap-3 text-slate-600 print:gap-2">
                    <span className="min-w-0 flex-1">VAT Exempt Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vat_exempt_sales)}</span>
                </div>
                <div className="flex items-start justify-between gap-3 text-slate-600 print:gap-2">
                    <span className="min-w-0 flex-1">Zero Rated Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.zero_rated_sales)}</span>
                </div>
                <div className="flex items-start justify-between gap-3 text-slate-600 print:gap-2">
                    <span className="min-w-0 flex-1">
                        Discount
                        {transaction.discount_label_snapshot ? ` (${transaction.discount_label_snapshot})` : ''}
                        {transaction.discount_rate_snapshot != null ? ` @ ${Number(transaction.discount_rate_snapshot).toFixed(2)}%` : ''}
                    </span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.discount_amount)}</span>
                </div>
                <div className="flex items-start justify-between gap-3 text-slate-600 print:gap-2">
                    <span className="min-w-0 flex-1">
                        {transaction.service_fee_label_snapshot || DGFY_CONVENIENCE_FEE_LABEL}
                        {transaction.service_fee_method_snapshot ? ` (${transaction.service_fee_method_snapshot})` : ''}
                    </span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.service_fee_amount)}</span>
                </div>
                {restaurantServiceChargeAmount > 0 && (
                    <div className="flex items-start justify-between gap-3 text-slate-600 print:gap-2">
                        <span className="min-w-0 flex-1">
                            {transaction.restaurant_service_charge_label_snapshot || 'Restaurant service charge'}
                            {transaction.restaurant_service_charge_rate_snapshot != null ? ` @ ${Number(transaction.restaurant_service_charge_rate_snapshot).toFixed(2)}%` : ''}
                        </span>
                        <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(restaurantServiceChargeAmount)}</span>
                    </div>
                )}
                <div className="flex items-start justify-between gap-3 pt-1 text-base font-semibold text-slate-900 print:gap-2 print:text-[12px]">
                    <span className="min-w-0 flex-1">Total</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.total_amount)}</span>
                </div>
            </div>
            <div className="text-center text-xs text-slate-500 mt-3 pt-3 border-t border-dashed border-slate-300 space-y-0.5 print:mt-2 print:pt-2 print:text-[9px]">
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

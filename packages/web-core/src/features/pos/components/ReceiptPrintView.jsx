import React from 'react';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import { renderPosReceiptHtml } from '@sieitzz/pos-receipt';

const money = (value) => Number(value || 0).toFixed(2);
const displayDiscountType = (value) => String(value || '').trim().toLowerCase() === 'manual'
    ? 'OTHER'
    : String(value || '').replace(/_/g, ' ').toUpperCase();
const DGFY_BRAND_NAME = 'DGFY';
const RECEIPT_LINE_GRID_COLUMNS = 'minmax(0, 1fr) 3.25rem 1.25rem 3.25rem';
const RECEIPT_LINE_GRID_COLUMNS_57MM = 'minmax(0, 1fr) 2.45rem 1.05rem 2.45rem';
const RECEIPT_PAPER_WIDTHS = {
    '80mm': '80mm',
    '57mm': '57mm'
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

const parsePaymentBreakdown = (value) => {
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

    return 'non_fiscal_slip';
};

const isStatutorySeniorPwdDiscount = (governedDiscount) => {
    const discountType = String(governedDiscount?.discount_type || '').trim().toLowerCase();
    return discountType === 'senior' || discountType === 'pwd';
};

export function LegacyReceiptPrintView({ transaction, businessSettings = {}, receiptContract = null, paperWidth = '80mm' }) {
    if (!transaction) return null;

    const printedAt = transaction.created_at
        ? new Date(transaction.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
        : '-';
    const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
    const paymentBreakdown = parsePaymentBreakdown(transaction.payment_breakdown)
        .filter((entry) => Number(entry?.amount || 0) > 0);
    const documentType = resolveDocumentType({ transaction, receiptContract });
    const isFiscal = documentType === 'fiscal_invoice';
    const taxpayerType = String(businessSettings.pos_taxpayer_type || '').trim().toLowerCase();
    const isVatRegistered = !taxpayerType.includes('non');
    const documentLabel = isFiscal ? (isVatRegistered ? 'VAT INVOICE' : 'NON-VAT INVOICE') : '';
    const restaurantServiceChargeAmount = Number(transaction.restaurant_service_charge_amount || 0);
    const governedDiscount = transaction.discount && typeof transaction.discount === 'object' ? transaction.discount : null;
    const discountBeneficiaries = Array.isArray(governedDiscount?.beneficiaries) ? governedDiscount.beneficiaries : [];
    const showSeniorPwdReceiptFields = isStatutorySeniorPwdDiscount(governedDiscount);
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
                {documentLabel && <h3 className="mt-1.5 text-[12px] font-bold tracking-wide text-slate-950 print:mt-1 print:text-[11px]">{documentLabel}</h3>}
                {isFiscal && (
                    <div className="mt-1 space-y-0.5 text-[9px] leading-tight text-slate-700 print:text-[8px]">
                        {businessSettings.pos_tin_branch && <p>{isVatRegistered ? 'VAT REG TIN' : 'NON-VAT REG TIN'}: {businessSettings.pos_tin_branch}</p>}
                        <p>MIN: {businessSettings.pos_min_number || '-'}</p>
                        <p>PTU: {businessSettings.pos_ptu_number || '-'}</p>
                        <p>ATP/OCN No.: {businessSettings.pos_accreditation_number || '-'}</p>
                    </div>
                )}
                {isFiscal && (
                    <div className="mt-2 border-t border-dashed border-slate-300 pt-2 text-left text-[10px] leading-snug text-slate-700 print:mt-1.5 print:pt-1.5 print:text-[9px]">
                        <p className="mb-0.5 font-bold">SOLD TO:</p>
                        <p>Customer/Registered Name: {transaction.customer_name || transaction.buyer_name || '________________'}</p>
                        <p>TIN: {transaction.buyer_tin || '________________'}</p>
                        <p>Business Address: {transaction.buyer_address || '____________________'}</p>
                        {transaction.buyer_business_style && <p>Business Style: {transaction.buyer_business_style}</p>}
                    </div>
                )}
                <div className="mt-2 space-y-0.5 text-left text-[10px] text-slate-700 print:mt-1.5 print:text-[9px]">
                    <p className="flex justify-between gap-2"><span>Receipt No.</span><span className="text-right">{transaction.invoice_number || '-'}</span></p>
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
                    const itemDiscountAmount = Number((line?.item_discount || line?.item_discount_snapshot)?.discount_amount || 0);
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
                            {itemDiscountAmount > 0 && (
                                <p className="mt-0.5 text-[9px] font-semibold leading-snug text-rose-700 print:text-[8px]">
                                    Item discount: -PHP {money(itemDiscountAmount)}
                                </p>
                            )}
                            {modifiers.length > 0 && (
                                <p className="mt-0.5 pl-2 text-[9px] font-semibold leading-snug text-slate-500 print:pl-1.5 print:text-[8px]">
                                    Add-ons: {modifiers.map((modifier) => modifier.option_name || modifier.name).filter(Boolean).join(', ')}
                                </p>
                            )}
                            {line.fnb_special_instructions && (
                                <p className="mt-0.5 pl-2 text-[9px] italic leading-snug text-slate-500 print:pl-1.5 print:text-[8px]">
                                    Note: {line.fnb_special_instructions}
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
                    {discountBeneficiaries.map((beneficiary, index) => <div key={beneficiary.id || `${beneficiary.id_number}-${index}`} className="flex justify-between gap-2 text-slate-600"><span>{String(beneficiary.category || 'Senior/PWD').toUpperCase()} {index + 1}</span><span className="text-right">{beneficiary.customer_name} — {beneficiary.id_number}</span></div>)}
                    {governedDiscount.employee_name && <div className="flex justify-between gap-2 text-slate-600"><span>Employee</span><span className="text-right">{governedDiscount.employee_name}</span></div>}
                    {governedDiscount.employee_id && <div className="flex justify-between gap-2 text-slate-600"><span>Employee ID</span><span className="text-right">{governedDiscount.employee_id}</span></div>}
                    {governedDiscount.promo_code && <div className="flex justify-between gap-2 text-slate-600"><span>{governedDiscount.discount_type === 'voucher' ? 'Voucher Code' : 'Promo Code'}</span><span className="text-right">{governedDiscount.promo_code}</span></div>}
                    {governedDiscount.discount_type && <div className="flex justify-between gap-2 text-slate-600"><span>Discount Type</span><span className="text-right">{displayDiscountType(governedDiscount.discount_type)}</span></div>}
                    {governedDiscount.reason && <div className="flex justify-between gap-2 text-slate-600"><span>Reason</span><span className="text-right">{governedDiscount.reason}</span></div>}
                </>}
                {isFiscal && <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">VATable Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vatable_sales)}</span>
                </div>}
                {isFiscal && <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">VAT Amount (12%)</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vat_amount)}</span>
                </div>}
                {isFiscal && <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">VAT Exempt Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.vat_exempt_sales)}</span>
                </div>}
                {isFiscal && <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">Zero Rated Sales</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.zero_rated_sales)}</span>
                </div>}
                {!isFiscal && <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">Estimated Tax</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right">Included</span>
                </div>}
                <div className="flex items-start justify-between gap-2 text-slate-600">
                    <span className="min-w-0 flex-1">
                        Discount
                        {transaction.discount_label_snapshot ? ` (${transaction.discount_label_snapshot})` : ''}
                        {transaction.discount_rate_snapshot != null ? ` @ ${Number(transaction.discount_rate_snapshot).toFixed(2)}%` : ''}
                    </span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.discount_amount)}</span>
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
                {Number(transaction.delivery_fee || 0) > 0 && (
                    <div className="flex items-start justify-between gap-2 text-slate-600">
                        <span className="min-w-0 flex-1">Delivery Fee</span>
                        <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.delivery_fee)}</span>
                    </div>
                )}
                <div className="mt-1 flex items-start justify-between gap-2 border-t border-slate-300 pt-1 text-[12px] font-bold text-slate-950 print:text-[11px]">
                    <span className="min-w-0 flex-1">TOTAL AMOUNT DUE</span>
                    <span className="shrink-0 whitespace-nowrap pl-2 text-right tabular-nums">{money(transaction.total_amount)}</span>
                </div>
            </div>
            <div className="mt-2 border-t border-dashed border-slate-300 pt-2 text-[10px] leading-snug text-slate-700 print:mt-1.5 print:pt-1.5 print:text-[9px]">
                <p className="flex justify-between gap-2"><span>Payment Method:</span><span>{String(transaction.payment_type || '').replace(/_/g, ' ').toUpperCase()}</span></p>
                {paymentBreakdown.length > 0 && <div className="mt-1 border-t border-dashed border-slate-200 pt-1"><p className="font-semibold">Payment Breakdown</p>{paymentBreakdown.map((entry, index) => <p key={`${entry.payment_type}-${entry.amount}-${index}`} className="flex justify-between gap-2"><span>{entry.payment_label || String(entry.payment_type || '').replace(/_/g, ' ')}</span><span>{money(entry.amount)}</span></p>)}</div>}
                <p className="flex justify-between gap-2"><span>Payment Status:</span><span>{String(transaction.payment_status || '').replace(/_/g, ' ').toUpperCase()}</span></p>
                {transaction.payment_reference && <p className="flex justify-between gap-2"><span>Payment Reference:</span><span className="text-right">{transaction.payment_reference}</span></p>}
                {transaction.payment_type === 'cash' && <p className="flex justify-between gap-2"><span>Cash Received:</span><span>{money(transaction.cash_received)}</span></p>}
                {transaction.payment_type === 'cash' && <p className="flex justify-between gap-2"><span>Change:</span><span>{money(transaction.change_amount)}</span></p>}
                {transaction.payment_type === 'employee_credit' && (
                    <div className="mt-2 space-y-0.5">
                        <p className="flex justify-between gap-2"><span>Employee:</span><span className="text-right">{transaction.employee_credit_employee_name_snapshot || '-'}</span></p>
                        <p className="flex justify-between gap-2"><span>Credit Account:</span><span>{transaction.employee_credit_account_code_snapshot || '-'}</span></p>
                        <p className="flex justify-between gap-2"><span>Credit Amount:</span><span>{money(transaction.employee_credit_amount)}</span></p>
                        <p className="flex justify-between gap-2"><span>Remaining Credit:</span><span>{money(transaction.employee_credit_balance_after)}</span></p>
                        <p className="flex justify-between gap-2"><span>Authorization:</span><span className="text-right">{transaction.employee_credit_authorization_reference || '-'}</span></p>
                        <p className="pt-2">Employee Signature: ____________________</p>
                    </div>
                )}
                {showSeniorPwdReceiptFields && (
                    <div className="mt-2">
                        {discountBeneficiaries.length > 0 ? discountBeneficiaries.map((beneficiary, index) => (
                            <div key={beneficiary.id || `${beneficiary.id_number}-${index}`} className="mb-1">
                                <p>{String(beneficiary.category || 'SC/PWD').toUpperCase()} ID No.: {beneficiary.id_number}</p>
                                <p>Name/Signature: {beneficiary.customer_name} __________________</p>
                            </div>
                        )) : <>
                            <p>SC/PWD/NAAC/MOV/Solo Parent ID No.: {governedDiscount?.senior_pwd_id_number || '____________'}</p>
                            <p>Signature: __________________________</p>
                        </>}
                    </div>
                )}
            </div>
            <div className="mt-2 border-t border-dashed border-slate-300 pt-2 text-center text-[9px] leading-snug text-slate-600 print:mt-1.5 print:pt-1.5 print:text-[8px]">
                {isFiscal && <p className="font-bold">FISCAL RECEIPT</p>}
                <p>{isFiscal ? 'Includes tax breakdown and fiscal identifiers.' : 'This document is not an official receipt.'}</p>
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

/** The browser shell shares this escaped receipt document with the Expo DOM preview. */
export default function ReceiptPrintView({ transaction, businessSettings = {}, receiptContract = null, paperWidth = '80mm' }) {
    if (!transaction) return null;
    const normalizedSettings = {
        ...businessSettings,
        storefront_profile_image_url: businessSettings.storefront_profile_image_url
            ? resolveAssetUrl(businessSettings.storefront_profile_image_url)
            : businessSettings.profile_image_url ? resolveAssetUrl(businessSettings.profile_image_url) : ''
    };
    return <div dangerouslySetInnerHTML={{ __html: renderPosReceiptHtml({ transaction, businessSettings: normalizedSettings, receiptContract, paperWidth }) }} />;
}

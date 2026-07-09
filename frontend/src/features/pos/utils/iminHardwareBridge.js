import { emitPosHardwareMessage } from './posHardwareMessageBus.js';
import resolveAssetUrl from '@/src/utils/assetUrl.js';

const RECEIPT_COLUMNS = 42;

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

const safeText = (value, fallback = '') => {
    const text = String(value ?? fallback).replace(/\s+/g, ' ').trim();
    return text || fallback;
};

const line = (char = '-') => char.repeat(RECEIPT_COLUMNS);

const center = (value) => {
    const text = safeText(value);
    if (text.length >= RECEIPT_COLUMNS) return text;
    const left = Math.floor((RECEIPT_COLUMNS - text.length) / 2);
    return `${' '.repeat(left)}${text}`;
};

const pair = (label, value) => {
    const left = safeText(label);
    const right = safeText(value);
    const space = RECEIPT_COLUMNS - left.length - right.length;
    if (space <= 1) return `${left} ${right}`;
    return `${left}${' '.repeat(space)}${right}`;
};

const wrapText = (value, width = RECEIPT_COLUMNS) => {
    const words = safeText(value).split(' ').filter(Boolean);
    const rows = [];
    let current = '';

    words.forEach((word) => {
        if (!current) {
            current = word;
            return;
        }
        if (`${current} ${word}`.length <= width) {
            current = `${current} ${word}`;
            return;
        }
        rows.push(current);
        current = word;
    });

    if (current) rows.push(current);
    return rows.length ? rows : [''];
};

const parseBridgeResult = (value, fallbackMessage) => {
    if (value && typeof value === 'object') {
        return {
            success: value.success !== false,
            message: safeText(value.message, fallbackMessage),
            diagnostics: value.diagnostics || value.printer || null
        };
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parseBridgeResult(parsed, fallbackMessage);
        } catch {
            return {
                success: true,
                message: safeText(value, fallbackMessage)
            };
        }
    }

    return {
        success: true,
        message: fallbackMessage,
        diagnostics: null
    };
};

export const notifyIminWebPosReady = () => {
    const bridge = typeof window !== 'undefined' ? window.iMinBridge : null;
    if (!bridge || typeof bridge.notifyWebPosReady !== 'function') return false;

    try {
        bridge.notifyWebPosReady();
        return true;
    } catch {
        return false;
    }
};

export const playOrderAlertWithIminBridge = (soundType = 'new_order') => {
    const bridge = getIminBridge();
    if (!bridge || typeof bridge.playOrderAlert !== 'function') {
        return { handled: false, result: null };
    }

    const result = parseBridgeResult(
        bridge.playOrderAlert(String(soundType || 'new_order').trim() || 'new_order'),
        'Order alert command sent.'
    );

    return {
        handled: true,
        result
    };
};

const formatDiagnostics = (diagnostics) => {
    if (!diagnostics || typeof diagnostics !== 'object') return '';
    const details = [
        diagnostics.bindRequested != null ? `bind=${diagnostics.bindRequested}` : '',
        diagnostics.printerServiceConnected != null ? `connected=${diagnostics.printerServiceConnected}` : '',
        diagnostics.lastConnectionEvent ? `connection=${diagnostics.lastConnectionEvent}` : '',
        diagnostics.lastCommand ? `command=${diagnostics.lastCommand}` : '',
        diagnostics.lastErrorClass ? `error=${diagnostics.lastErrorClass}` : '',
        diagnostics.lastErrorMessage ? `message=${diagnostics.lastErrorMessage}` : ''
    ].filter(Boolean);
    return details.length ? ` (${details.join(', ')})` : '';
};

const getIminBridge = () => {
    if (typeof window === 'undefined') return null;
    const bridge = window.iMinBridge;
    if (!bridge || typeof bridge.isIminWrapper !== 'function') return null;

    try {
        return bridge.isIminWrapper() ? bridge : null;
    } catch {
        return null;
    }
};

const resolveReceiptLogoSource = (businessSettings = {}) => {
    const raw = String(
        businessSettings?.storefront_profile_image_url
        || businessSettings?.profile_image_url
        || ''
    ).trim();
    return raw ? resolveAssetUrl(raw) : '';
};

const tryPrintReceiptBitmap = (bridge, businessSettings = {}) => {
    if (!bridge || typeof bridge.printBitmap !== 'function') {
        return null;
    }

    const imageSource = resolveReceiptLogoSource(businessSettings);
    if (!imageSource) {
        return null;
    }

    return parseBridgeResult(
        bridge.printBitmap(imageSource, {
            align: 'center',
            maxWidthPx: 360,
            dither: true,
            feedAfter: 1
        }),
        'Receipt logo print command sent.'
    );
};

const resolveDocumentLabel = (transaction, receiptContract) => {
    const contractType = String(receiptContract?.document_type || '').toLowerCase();
    const transactionType = String(transaction?.document_type || '').toLowerCase();
    const documentType = contractType || transactionType;
    if (documentType === 'fiscal_invoice') return 'FISCAL INVOICE';
    return 'NON-FISCAL SLIP';
};

const resolveDocumentType = (transaction, receiptContract) => {
    const contractType = String(receiptContract?.document_type || '').toLowerCase();
    if (contractType === 'fiscal_invoice' || contractType === 'non_fiscal_slip') return contractType;

    const transactionType = String(transaction?.document_type || '').toLowerCase();
    if (transactionType === 'fiscal_invoice' || transactionType === 'non_fiscal_slip') return transactionType;

    return 'non_fiscal_slip';
};

const resolveDocumentContext = (transaction, receiptContract, documentType) => {
    const contractContext = String(receiptContract?.document_context || '').trim().toLowerCase();
    if (['fiscal', 'non_fiscal', 'training_test'].includes(contractContext)) return contractContext;

    const transactionContext = String(transaction?.document_context || '').trim().toLowerCase();
    if (['fiscal', 'non_fiscal', 'training_test'].includes(transactionContext)) return transactionContext;

    return documentType === 'fiscal_invoice' ? 'fiscal' : 'non_fiscal';
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

const pushCenteredWrapped = (rows, value) => {
    wrapText(value).forEach((row) => rows.push(center(row)));
};

export const formatIminReceiptText = ({ transaction, businessSettings = {}, receiptContract = null }) => {
    const lines = Array.isArray(transaction?.lines) ? transaction.lines : [];
    const printedAt = transaction?.created_at
        ? new Date(transaction.created_at).toLocaleString()
        : new Date().toLocaleString();
    const documentType = resolveDocumentType(transaction, receiptContract);
    const documentContext = resolveDocumentContext(transaction, receiptContract, documentType);
    const isFiscal = documentType === 'fiscal_invoice';
    const restaurantServiceChargeAmount = Number(transaction?.restaurant_service_charge_amount || 0);
    const receiptRows = [];
    const taxpayerType = safeText(businessSettings.pos_taxpayer_type).toLowerCase();
    const vatRegistered = !taxpayerType.includes('non');

    if (businessSettings.pos_registered_name) {
        receiptRows.push(center(String(businessSettings.pos_registered_name).toUpperCase()));
    }
    if (businessSettings.pos_business_name) {
        receiptRows.push(center(businessSettings.pos_business_name));
    }
    if (businessSettings.pos_address) {
        pushCenteredWrapped(receiptRows, businessSettings.pos_address);
    }
    if (businessSettings.pos_tin_branch) {
        receiptRows.push(center(`${vatRegistered ? 'VAT REG TIN' : 'NON-VAT REG TIN'}: ${businessSettings.pos_tin_branch}`));
    }
    if (isFiscal && businessSettings.pos_ptu_number) {
        receiptRows.push(center(`PTU: ${businessSettings.pos_ptu_number}`));
    }
    if (isFiscal && businessSettings.pos_min_number) {
        receiptRows.push(center(`MIN: ${businessSettings.pos_min_number}`));
    }
    if (isFiscal && businessSettings.pos_accreditation_number) {
        pushCenteredWrapped(receiptRows, `ATP/OCN No.: ${businessSettings.pos_accreditation_number}`);
    }
    if (isFiscal && businessSettings.pos_software_name) {
        pushCenteredWrapped(receiptRows, `Software: ${businessSettings.pos_software_name}`);
    }
    if (isFiscal && businessSettings.pos_software_version) {
        receiptRows.push(center(`Version: ${businessSettings.pos_software_version}`));
    }
    if (isFiscal && businessSettings.pos_software_serial_number) {
        pushCenteredWrapped(receiptRows, `Serial: ${businessSettings.pos_software_serial_number}`);
    }

    receiptRows.push(
        line(),
        center(isFiscal ? (vatRegistered ? 'VAT INVOICE' : 'NON-VAT INVOICE') : resolveDocumentLabel(transaction, receiptContract)),
    );

    if (!isFiscal) {
        receiptRows.push(
            center('NOT A FISCAL RECEIPT'),
            center(documentContext === 'training_test' ? 'Training/Test mode only' : 'Non-fiscal document')
        );
    }

    if (isFiscal) {
        receiptRows.push('SOLD TO:');
        pushCenteredWrapped(receiptRows, `Customer: ${transaction?.customer_name || transaction?.buyer_name || '________________'}`);
        receiptRows.push(`TIN: ${transaction?.buyer_tin || '________________'}`);
        pushCenteredWrapped(receiptRows, `Address: ${transaction?.buyer_address || '________________'}`);
        if (transaction?.buyer_business_style) {
            pushCenteredWrapped(receiptRows, `Business Style: ${transaction.buyer_business_style}`);
        }
    }

    receiptRows.push(
        `Receipt No.: ${transaction?.invoice_number || '-'}`,
        `Date/Time: ${printedAt}`,
        `Terminal: ${transaction?.terminal_id || '-'}`,
        `Cashier: ${transaction?.cashier?.username || transaction?.acceptedByUser?.username || '-'}`
    );

    if (transaction?.fnb_check_id || transaction?.fnb_table_label_snapshot || transaction?.fnb_guest_count) {
        const fnbParts = [
            transaction?.fnb_check_id ? `F&B Check #${transaction.fnb_check_id}` : 'F&B Check',
            transaction?.fnb_table_label_snapshot ? `Table ${transaction.fnb_table_label_snapshot}` : '',
            transaction?.fnb_guest_count ? `Guests ${transaction.fnb_guest_count}` : ''
        ].filter(Boolean);
        pushCenteredWrapped(receiptRows, fnbParts.join(' '));
    }

    receiptRows.push(line());

    lines.forEach((item) => {
        const itemName = safeText(item?.item?.name, `Item #${item?.item_id || '-'}`);
        const quantity = Number(item?.quantity || 0).toFixed(2);
        const unit = safeText(item?.unit_of_measure);
        const price = money(item?.sale_price);
        const subtotal = money(item?.line_subtotal);
        const modifiers = parseArrayMetadata(item?.fnb_modifiers_snapshot)
            .map((modifier) => modifier?.option_name || modifier?.name)
            .filter(Boolean);

        wrapText(itemName).forEach((row) => receiptRows.push(row));
        receiptRows.push(pair(`${quantity} ${unit} x ${price}`.trim(), subtotal));
        const fnbDetails = [
            item?.fnb_course_snapshot ? `Course: ${item.fnb_course_snapshot}` : '',
            modifiers.length ? `Modifiers: ${modifiers.join(', ')}` : '',
            item?.fnb_special_instructions ? `Notes: ${item.fnb_special_instructions}` : ''
        ].filter(Boolean).join(' ');
        if (fnbDetails) {
            wrapText(fnbDetails).forEach((row) => receiptRows.push(`  ${row}`.slice(0, RECEIPT_COLUMNS)));
        }
    });

    receiptRows.push(line(), pair('TOTAL SALES', money(transaction?.subtotal_amount)));
    if (isFiscal) {
        receiptRows.push(
            pair('Vatable Sales', money(transaction?.vatable_sales)),
            pair('VAT 12%', money(transaction?.vat_amount)),
            pair('VAT Exempt Sales', money(transaction?.vat_exempt_sales)),
            pair('Zero Rated Sales', money(transaction?.zero_rated_sales))
        );
    } else {
        receiptRows.push(pair('Estimated Tax', 'Included'));
    }

    const discountLabel = [
        'Discount',
        transaction?.discount_label_snapshot ? `(${transaction.discount_label_snapshot})` : '',
        transaction?.discount_rate_snapshot != null ? `@ ${Number(transaction.discount_rate_snapshot).toFixed(2)}%` : ''
    ].filter(Boolean).join(' ');
    receiptRows.push(pair(discountLabel, money(transaction?.discount_amount)));

    const serviceFeeLabel = [
        transaction?.service_fee_label_snapshot || 'DGFY convenience fee',
        transaction?.service_fee_method_snapshot ? `(${transaction.service_fee_method_snapshot})` : ''
    ].filter(Boolean).join(' ');
    receiptRows.push(pair(serviceFeeLabel, money(transaction?.service_fee_amount)));

    if (restaurantServiceChargeAmount > 0) {
        const restaurantChargeLabel = [
            transaction?.restaurant_service_charge_label_snapshot || 'Restaurant service charge',
            transaction?.restaurant_service_charge_rate_snapshot != null
                ? `@ ${Number(transaction.restaurant_service_charge_rate_snapshot).toFixed(2)}%`
                : ''
        ].filter(Boolean).join(' ');
        receiptRows.push(pair(restaurantChargeLabel, money(restaurantServiceChargeAmount)));
    }

    receiptRows.push(
        line('='),
        pair('TOTAL AMOUNT DUE', money(transaction?.total_amount)),
        line()
    );

    receiptRows.push(
        `Payment Method: ${safeText(transaction?.payment_type, '-').toUpperCase()}`,
        pair('Cash Received', money(transaction?.cash_received)),
        pair('Change', money(transaction?.change_amount))
    );
    receiptRows.push(
        line(),
        center(isFiscal ? 'FISCAL RECEIPT' : 'NON-FISCAL RECEIPT'),
        center(isFiscal ? 'Includes tax breakdown and fiscal identifiers.' : 'This document is not an official tax receipt.')
    );

    if (businessSettings.pos_receipt_footer_message) {
        pushCenteredWrapped(receiptRows, businessSettings.pos_receipt_footer_message);
    }
    receiptRows.push(center('Thank you. Please come again.'));
    receiptRows.push(center('Powered by DGFY POS'));

    return receiptRows.join('\n');
};

export const printReceiptWithIminBridge = ({ transaction, businessSettings = {}, receiptContract = null, openDrawerAfterPrint = true }) => {
    const bridge = getIminBridge();
    if (!bridge || typeof bridge.printReceipt !== 'function') {
        return { handled: false };
    }

    const bitmapResult = tryPrintReceiptBitmap(bridge, businessSettings);
    if (bitmapResult) {
        emitPosHardwareMessage({
            title: 'iMin receipt printer',
            message: bitmapResult.message || 'Receipt logo print command sent.',
            tone: bitmapResult.success ? 'info' : 'error',
            source: 'iMin hardware',
            details: bitmapResult.diagnostics || null
        });

        if (!bitmapResult.success) {
            throw new Error(`${bitmapResult.message || 'Failed to print receipt logo on iMin printer.'}${formatDiagnostics(bitmapResult.diagnostics)}`);
        }
    }

    const result = parseBridgeResult(
        bridge.printReceipt(
            formatIminReceiptText({ transaction, businessSettings, receiptContract }),
            Boolean(openDrawerAfterPrint)
        ),
        'Receipt print command sent.'
    );

    emitPosHardwareMessage({
        title: 'iMin receipt printer',
        message: result.message || 'Receipt print command sent.',
        tone: result.success ? 'success' : 'error',
        source: 'iMin hardware',
        details: result.diagnostics || null
    });

    if (!result.success) {
        throw new Error(`${result.message || 'Failed to print on iMin printer.'}${formatDiagnostics(result.diagnostics)}`);
    }

    return { handled: true, result };
};

export const formatIminOrderTicketText = ({ cart = [], terminalId = '', orderMethod = '', fnbContext = null }) => {
    const rows = [
        center('DGFY'),
        center('PRINT ORDER'),
        center(new Date().toLocaleString())
    ];

    if (terminalId) {
        rows.push(center(`Terminal: ${terminalId}`));
    }
    if (orderMethod) {
        rows.push(center(`Order: ${String(orderMethod).replace(/_/g, ' ')}`));
    }
    if (fnbContext?.fnb_check_id || fnbContext?.table_label || fnbContext?.fnb_table_label_snapshot) {
        const fnbParts = [
            fnbContext?.fnb_check_id ? `F&B Check #${fnbContext.fnb_check_id}` : '',
            fnbContext?.table_label || fnbContext?.fnb_table_label_snapshot
                ? `Table ${fnbContext.table_label || fnbContext.fnb_table_label_snapshot}`
                : ''
        ].filter(Boolean);
        pushCenteredWrapped(rows, fnbParts.join(' '));
    }

    rows.push(line('='));

    cart.forEach((cartLine, index) => {
        const quantity = Number(cartLine?.quantity || 0);
        const itemName = safeText(cartLine?.item_name, `Item #${cartLine?.item_id || index + 1}`);
        rows.push(`${quantity.toFixed(quantity % 1 === 0 ? 0 : 2)} x ${itemName}`.slice(0, RECEIPT_COLUMNS));

        const course = safeText(cartLine?.course || cartLine?.fnb_course_snapshot);
        if (course) {
            wrapText(`Course: ${course}`).forEach((row) => rows.push(`  ${row}`.slice(0, RECEIPT_COLUMNS)));
        }

        const modifiers = Array.isArray(cartLine?.line_modifiers)
            ? cartLine.line_modifiers.map((modifier) => (
                modifier?.option_name || modifier?.name || modifier?.modifier_name
            )).filter(Boolean)
            : parseArrayMetadata(cartLine?.fnb_modifiers_snapshot)
                .map((modifier) => modifier?.option_name || modifier?.name)
                .filter(Boolean);
        if (modifiers.length) {
            wrapText(`Modifiers: ${modifiers.join(', ')}`).forEach((row) => rows.push(`  ${row}`.slice(0, RECEIPT_COLUMNS)));
        }

        const specialRequest = safeText(
            cartLine?.special_instructions || cartLine?.fnb_special_instructions || cartLine?.notes
        );
        if (specialRequest) {
            wrapText(`Special request: ${specialRequest}`).forEach((row) => rows.push(`  ${row}`.slice(0, RECEIPT_COLUMNS)));
        }

        rows.push(line());
    });

    rows.push(center('Kitchen / Order Copy'));
    return rows.join('\n');
};

export const printOrderWithIminBridge = ({ cart = [], terminalId = '', orderMethod = '', fnbContext = null }) => {
    const bridge = getIminBridge();
    if (!bridge || typeof bridge.printReceipt !== 'function') {
        return { handled: false };
    }

    const result = parseBridgeResult(
        bridge.printReceipt(
            formatIminOrderTicketText({ cart, terminalId, orderMethod, fnbContext }),
            false
        ),
        'Order ticket print command sent.'
    );

    emitPosHardwareMessage({
        title: 'iMin order printer',
        message: result.message || 'Order ticket print command sent.',
        tone: result.success ? 'success' : 'error',
        source: 'iMin hardware',
        details: result.diagnostics || null
    });

    if (!result.success) {
        throw new Error(`${result.message || 'Failed to print order ticket on iMin printer.'}${formatDiagnostics(result.diagnostics)}`);
    }

    return { handled: true, result };
};

export const openDrawerWithIminBridge = () => {
    const bridge = getIminBridge();
    if (!bridge || typeof bridge.openCashDrawer !== 'function') {
        return { handled: false };
    }

    const result = parseBridgeResult(
        bridge.openCashDrawer(),
        'Cash drawer open command sent.'
    );

    emitPosHardwareMessage({
        title: 'iMin cash drawer',
        message: result.message || 'Cash drawer open command sent.',
        tone: result.success ? 'success' : 'error',
        source: 'iMin hardware',
        details: result.diagnostics || null
    });

    if (!result.success) {
        throw new Error(`${result.message || 'Failed to open the iMin cash drawer.'}${formatDiagnostics(result.diagnostics)}`);
    }

    return { handled: true, result };
};

export const getIminHardwareDiagnostics = () => {
    const bridge = getIminBridge();
    if (!bridge || typeof bridge.getHardwareDiagnostics !== 'function') {
        return { handled: false };
    }

    const diagnostics = {
        handled: true,
        result: parseBridgeResult(
            bridge.getHardwareDiagnostics(),
            'iMin hardware diagnostics loaded.'
        )
    };
    emitPosHardwareMessage({
        title: 'iMin hardware diagnostics',
        message: diagnostics.result?.message || 'iMin hardware diagnostics loaded.',
        tone: diagnostics.result?.success === false ? 'error' : 'info',
        source: 'iMin hardware',
        details: diagnostics.result?.diagnostics || null
    });
    return diagnostics;
};

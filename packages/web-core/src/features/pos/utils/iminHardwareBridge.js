import { emitPosHardwareMessage } from './posHardwareMessageBus.js';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import {
    getDailySalesCheckCashSummary,
    getDailySalesCheckVoidActivity,
    isCashPayment
} from './posZReadingCashSummary.js';

const PAPER_WIDTH_COLUMNS = Object.freeze({
    '80mm': 42,
    '57mm': 32
});
const IMIN_ASYNC_RESULT_EVENT = 'dgfy:imin-command-result';
const IMIN_ASYNC_COMMAND_TIMEOUT_MS = 30_000;

// Keep physical iMin receipts ASCII-safe. The built-in printer and ESC/POS Bluetooth
// fallback do not reliably render the Unicode peso glyph, so the browser/UI preview
// remains unchanged while hardware output uses an explicit PHP label.
const HARDWARE_CURRENCY_PREFIX = 'PHP ';
const formatCurrencyAmount = (value) => Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
const money = (value) => `${HARDWARE_CURRENCY_PREFIX}${formatCurrencyAmount(value)}`;

const safeText = (value, fallback = '') => {
    const text = String(value ?? fallback).replace(/\s+/g, ' ').trim();
    return text || fallback;
};

const formatIminReceiptDateTime = (value, paperWidth = '80mm') => {
    const date = value ? new Date(value) : new Date();
    if (String(paperWidth || '').trim().toLowerCase() !== '57mm') {
        return date.toLocaleString();
    }
    if (Number.isNaN(date.getTime())) return '-';
    const datePart = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const timePart = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${datePart} ${timePart}`;
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

const formatPaymentLabel = (entry) => safeText(
    entry?.payment_label || entry?.payment_type,
    'Payment'
).replace(/_/g, ' ');
const formatDeliveryProviderLabel = (entry) => {
    const providerType = safeText(entry?.provider_type).toLowerCase();
    if (providerType === 'other') return `${safeText(entry?.provider_name, 'Other')} (Other)`;
    if (providerType === 'foodpanda') return 'Foodpanda';
    if (providerType === 'grab') return 'Grab';
    return safeText(entry?.display_label || providerType, 'Delivery provider');
};

const displayDiscountType = (value) => safeText(value).toLowerCase() === 'manual'
    ? 'OTHER'
    : safeText(value).replace(/_/g, ' ').toUpperCase();

const truncateText = (value, maxWidth) => {
    const text = safeText(value);
    const width = Math.max(1, Number(maxWidth) || 1);
    if (text.length <= width) return text;
    if (width <= 3) return text.slice(0, width);
    return `${text.slice(0, width - 3)}...`;
};

const createTextLayout = (paperWidth = '80mm') => {
    const columns = PAPER_WIDTH_COLUMNS[String(paperWidth || '').trim().toLowerCase()] || PAPER_WIDTH_COLUMNS['80mm'];
    const isNarrow = columns === PAPER_WIDTH_COLUMNS['57mm'];
    const line = (char = '-') => String(char || '-').slice(0, 1).repeat(columns);

    const center = (value) => {
        const rawText = safeText(value);
        const text = truncateText(rawText, columns);
        const left = Math.floor((columns - text.length) / 2);
        return `${' '.repeat(left)}${text}`;
    };

    const pair = (label, value) => {
        const left = safeText(label);
        const right = safeText(value);
        const space = columns - left.length - right.length;
        if (space > 1) return `${left}${' '.repeat(space)}${right}`;

        const fittedRight = truncateText(right, Math.max(1, columns - 2));
        const fittedLeft = truncateText(left, Math.max(1, columns - fittedRight.length - 1));
        return `${fittedLeft} ${fittedRight}`.slice(0, columns);
    };

    const wrapText = (value, width = columns) => {
        const safeWidth = Math.max(1, Number(width) || columns);
        const words = safeText(value).split(' ').filter(Boolean);
        const rows = [];
        let current = '';

        words.forEach((word) => {
            if (isNarrow && word.length > safeWidth) {
                if (current) {
                    rows.push(current);
                    current = '';
                }
                for (let index = 0; index < word.length; index += safeWidth) {
                    rows.push(word.slice(index, index + safeWidth));
                }
                return;
            }
            if (!current) {
                current = word;
                return;
            }
            if (`${current} ${word}`.length <= safeWidth) {
                current = `${current} ${word}`;
                return;
            }
            rows.push(current);
            current = word;
        });

        if (current) rows.push(current);
        return rows.length ? rows : [''];
    };

    const pushCenteredWrapped = (rows, value) => {
        wrapText(value).forEach((row) => rows.push(center(row)));
    };
    const fitRows = (rows) => rows.flatMap((row) => {
        const text = String(row ?? '');
        return text.length <= columns ? [text] : wrapText(text, columns);
    }).map((row) => truncateText(row, columns));

    return { columns, line, center, pair, wrapText, pushCenteredWrapped, fitRows };
};

const { line, center, pair } = createTextLayout('80mm');

const parseBridgeResult = (value, fallbackMessage) => {
    if (value && typeof value === 'object') {
        return {
            success: value.success !== false,
            message: safeText(value.message, fallbackMessage),
            diagnostics: value.diagnostics || value.printer || null,
            ...(typeof value.mayHaveExecuted === 'boolean' ? { mayHaveExecuted: value.mayHaveExecuted } : {}),
            ...(typeof value.drawerOpened === 'boolean' ? { drawerOpened: value.drawerOpened } : {})
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

const createIminCommandError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const requestIminAsyncResult = (startCommand, fallbackMessage) => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return Promise.reject(new Error('The iMin asynchronous bridge is unavailable.'));
    }

    const requestId = globalThis.crypto?.randomUUID?.()
        || `imin-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            window.removeEventListener(IMIN_ASYNC_RESULT_EVENT, handleResult);
            clearTimeout(timeoutId);
        };
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const handleResult = (event) => {
            if (event?.detail?.requestId !== requestId) return;
            finish(resolve, event.detail.result);
        };
        const timeoutId = setTimeout(() => {
            finish(reject, createIminCommandError(
                'The iMin hardware command did not return a final result in time. Check the device before retrying.',
                'IMIN_COMMAND_TIMEOUT'
            ));
        }, IMIN_ASYNC_COMMAND_TIMEOUT_MS);

        window.addEventListener(IMIN_ASYNC_RESULT_EVENT, handleResult);
        try {
            const accepted = parseBridgeResult(startCommand(requestId), fallbackMessage);
            if (!accepted.success) {
                finish(reject, createIminCommandError(
                    accepted.message || 'The iMin hardware command was rejected.',
                    'IMIN_COMMAND_REJECTED'
                ));
            }
        } catch (error) {
            finish(reject, error);
        }
    });
};

const mapMaybePromise = (value, mapper) => (
    value && typeof value.then === 'function' ? value.then(mapper) : mapper(value)
);

const sendIminTextPrint = ({ bridge, receiptText, openDrawerAfterPrint = false, fallbackMessage }) => {
    if (typeof bridge.printReceiptAsync === 'function') {
        return requestIminAsyncResult(
            (requestId) => bridge.printReceiptAsync(
                requestId,
                receiptText,
                Boolean(openDrawerAfterPrint)
            ),
            fallbackMessage
        );
    }

    return bridge.printReceipt(receiptText, Boolean(openDrawerAfterPrint));
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

export const stopOrderAlertWithIminBridge = () => {
    const bridge = getIminBridge();
    if (!bridge || typeof bridge.stopOrderAlert !== 'function') {
        return { handled: false, result: null };
    }

    try {
        const result = parseBridgeResult(
            bridge.stopOrderAlert(),
            'Order alert stopped.'
        );

        return {
            handled: true,
            result
        };
    } catch {
        return {
            handled: true,
            result: {
                success: false,
                message: 'Order alert stop command failed.'
            }
        };
    }
};

export const saveOrderAlertSoundWithIminBridge = (soundType, base64Data, mimeType = 'audio/wav') => {
  const bridge = getIminBridge();
  if (!bridge || typeof bridge.saveOrderAlertSound !== 'function') {
    return { handled: false, result: null };
  }

  const normalizedSoundType = String(soundType || 'new_order').trim() || 'new_order';
  const normalizedBase64Data = String(base64Data || '').trim();
  const normalizedMimeType = String(mimeType || 'audio/wav').trim() || 'audio/wav';
  const result = parseBridgeResult(
    bridge.saveOrderAlertSound(normalizedSoundType, normalizedBase64Data, normalizedMimeType),
    'Order alert sound saved on the device.'
  );

  return {
    handled: true,
    result
  };
};

// One short, cashier-readable sentence for a failed print/drawer command,
// replacing the long "Bluetooth receipt failed: ... | bindRequested=..." dump
// the bridge otherwise returns verbatim. Diagnostics still travel in full on
// result.diagnostics for the hardware-diagnostics panel/audit trail -- this
// only decides what the cashier-facing toast says.
const describeIminPrinterFailure = (diagnostics, nativeMessage) => {
    const bluetooth = diagnostics?.bluetoothEscPos;
    const serviceConnected = diagnostics?.printerServiceConnected === true;

    if (!serviceConnected && bluetooth) {
        if (bluetooth.permissionGranted === false) {
            return {
                reasonCode: 'PRINTER_PERMISSION_MISSING',
                message: 'Grant Bluetooth permission to use the receipt printer.'
            };
        }
        if (bluetooth.adapterEnabled === false) {
            return {
                reasonCode: 'PRINTER_BLUETOOTH_OFF',
                message: 'Turn on Bluetooth to use the receipt printer.'
            };
        }
        if (Number(bluetooth.printerCandidateCount ?? bluetooth.pairedCount ?? 0) === 0) {
            return {
                reasonCode: 'NO_PRINTER_CONFIGURED',
                message: 'No receipt printer is connected to this device.'
            };
        }
    }

    // Anything else is a genuine send failure with a paired/connected
    // printer -- keep the native message, but drop everything from the
    // diagnostics dump onward (buildDiagnosticMessage() joins it with " | ").
    const shortNativeMessage = String(nativeMessage || '').split('|')[0].trim();
    return {
        reasonCode: 'IMIN_PRINT_FAILED',
        message: shortNativeMessage || 'Failed to print on the receipt printer.'
    };
};

// Normalizes a failed parseBridgeResult() into one with a short message/
// reasonCode, keeping the raw diagnostics attached under the same key so
// callers (and the audit trail) still see the full detail.
const toHardwareFailureResult = (raw) => {
    const failure = describeIminPrinterFailure(raw?.diagnostics, raw?.message);
    return {
        ...raw,
        success: false,
        message: failure.message,
        reasonCode: failure.reasonCode
    };
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

// Native (see IminBridge.kt's printReceiptWithLogo / ReceiptLogoProvider) can only
// fetch an absolute http(s) URL or decode a data: URI -- a root-relative path or a
// page-scoped blob: URL means nothing outside this WebView document.
const isNativeFetchableLogoSource = (value) => /^(https?:|data:)/i.test(String(value || ''));

// The tenant company icon is stored as a backend-relative /uploads/storefront-assets
// path (apps/dgfy-api settingsValidator.js's storefrontAssetUrlSchema) and the POS
// image ships no asset origin (resolveAssetOrigin skips a root-relative VITE_API_URL),
// so resolveAssetUrl hands that path straight back. The on-screen preview still works
// -- <img src="/uploads/..."> resolves against the document -- but native has no such
// base, received '', and printed the bundled DGFY drawable instead of the tenant's
// icon (issue #321). Supply the base explicitly: every POS-serving edge vhost proxies
// /uploads to dgfy-api on the same origin the WebView already loaded
// (infrastructure/docker/nginx/nginx.conf.template, infrastructure/nginx-host/*.conf),
// and /uploads is public static mounted ahead of auth (apps/dgfy-api/src/server.js),
// so a bare native GET against that origin resolves. Anything this cannot absolutize
// still falls through to the fetchability gate above rather than being forwarded.
const absolutizeLogoSource = (value) => {
    const raw = String(value || '').trim();
    if (!raw.startsWith('/')) return raw;
    // Runs under Node/Vitest as well as the WebView, hence the window guard.
    const origin = typeof window === 'undefined'
        ? ''
        : String(window?.location?.origin || '').trim();
    if (!origin) return raw;

    try {
        return new URL(raw, origin).toString();
    } catch {
        return raw;
    }
};

const resolveReceiptLogoSource = (businessSettings = {}) => {
    const raw = String(
        businessSettings?.storefront_profile_image_url
        || businessSettings?.profile_image_url
        || ''
    ).trim();
    if (!raw) return '';
    // An already-absolute source must reach native byte-identical. resolveAssetUrl
    // round-trips its input through `new URL(...).toString()`, which can silently
    // canonicalize a valid absolute URL (lowercase the host, drop an explicit
    // default port) before absolutizeLogoSource ever sees it -- so skip it entirely
    // here rather than relying on absolutizeLogoSource's own no-op-on-non-root-
    // relative-input behaviour to undo a normalization that already happened.
    const resolved = isNativeFetchableLogoSource(raw)
        ? raw
        : absolutizeLogoSource(resolveAssetUrl(raw));
    return isNativeFetchableLogoSource(resolved) ? resolved : '';
};

const resolveDocumentType = (transaction, receiptContract) => {
    const contractType = String(receiptContract?.document_type || '').toLowerCase();
    if (contractType === 'fiscal_invoice' || contractType === 'non_fiscal_slip') return contractType;

    const transactionType = String(transaction?.document_type || '').toLowerCase();
    if (transactionType === 'fiscal_invoice' || transactionType === 'non_fiscal_slip') return transactionType;

    return 'non_fiscal_slip';
};

const isStatutorySeniorPwdDiscount = (discount) => {
    const discountType = safeText(discount?.discount_type).toLowerCase();
    return discountType === 'senior' || discountType === 'pwd';
};

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const discountAllocationForLine = (transaction, item) => {
    const allocations = Array.isArray(transaction?.discount?.lines) ? transaction.discount.lines : [];
    const lineId = Number(item?.line_id ?? item?.id);
    if (!Number.isFinite(lineId)) return null;
    return allocations.find((allocation) => Number(allocation?.transaction_line_id) === lineId) || null;
};

const allocationAmount = (allocation, field) => {
    const value = Number(allocation?.[field]);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
};

const resolveReceiptLineGrossTotal = (transaction, item, netTotal) => {
    const explicit = Number(item?.gross_amount ?? item?.gross_total ?? item?.gross_subtotal);
    if (Number.isFinite(explicit)) return roundCurrency(explicit);

    const allocation = discountAllocationForLine(transaction, item);
    const persistedAdjustments = allocationAmount(allocation, 'discount_amount')
        + allocationAmount(allocation, 'vat_removed');
    if (persistedAdjustments > 0) return roundCurrency(netTotal + persistedAdjustments);

    const quantity = Number(item?.quantity ?? item?.qty ?? 0) || 0;
    const salePrice = Number(item?.sale_price ?? item?.unit_price ?? item?.unit_price_snapshot ?? item?.price);
    const fallbackGross = Number.isFinite(salePrice) ? quantity * salePrice : netTotal;
    return roundCurrency(Math.max(netTotal, fallbackGross));
};

const resolveReceiptLineDiscount = (transaction, item, netTotal, grossTotal) => {
    const allocation = discountAllocationForLine(transaction, item);
    if (allocation) return roundCurrency(allocationAmount(allocation, 'discount_amount'));
    return roundCurrency(Math.max(0, grossTotal - netTotal));
};

const formatDiscountLabel = (transaction) => {
    const label = safeText(transaction?.discount_label_snapshot);
    return label ? `Discount (${label})` : 'Discount';
};

const negativeMoney = (value) => {
    const amount = roundCurrency(value);
    return amount > 0 ? `-${HARDWARE_CURRENCY_PREFIX}${formatCurrencyAmount(amount)}` : money(0);
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

export const formatIminReceiptText = ({ transaction, businessSettings = {}, receiptContract = null, paperWidth = '80mm' }) => {
    const {
        columns,
        line,
        center,
        pair,
        wrapText,
        pushCenteredWrapped,
        fitRows
    } = createTextLayout(paperWidth);
    const lines = Array.isArray(transaction?.lines) ? transaction.lines : [];
    const printedAt = formatIminReceiptDateTime(transaction?.created_at, paperWidth);
    const documentType = resolveDocumentType(transaction, receiptContract);
    const isFiscal = documentType === 'fiscal_invoice';
    const restaurantServiceChargeAmount = Number(transaction?.restaurant_service_charge_amount || 0);
    const governedDiscount = transaction?.discount && typeof transaction.discount === 'object' ? transaction.discount : null;
    const showSeniorPwdReceiptFields = isStatutorySeniorPwdDiscount(governedDiscount);
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

    receiptRows.push(line());
    if (isFiscal) {
        receiptRows.push(center(vatRegistered ? 'VAT INVOICE' : 'NON-VAT INVOICE'));
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
        const itemName = safeText(
            item?.item_name_snapshot || item?.item?.name || item?.item_snapshot?.name || item?.name,
            `Item #${item?.item_id || '-'}`
        );
        const quantity = Number(item?.quantity || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        const unit = safeText(item?.unit_of_measure);
        const price = money(item?.sale_price);
        const netTotal = roundCurrency(item?.line_subtotal ?? item?.line_total ?? item?.total_amount ?? item?.amount);
        const grossTotal = resolveReceiptLineGrossTotal(transaction, item, netTotal);
        const lineDiscount = resolveReceiptLineDiscount(transaction, item, netTotal, grossTotal);
        const modifiers = parseArrayMetadata(item?.fnb_modifiers_snapshot)
            .map((modifier) => modifier?.option_name || modifier?.name)
            .filter(Boolean);

        wrapText(itemName).forEach((row) => receiptRows.push(row));
        receiptRows.push(pair(`${quantity} ${unit} x ${price}`.trim(), money(lineDiscount > 0 ? grossTotal : netTotal)));
        if (lineDiscount > 0) {
            receiptRows.push(pair(formatDiscountLabel(transaction), negativeMoney(lineDiscount)));
            receiptRows.push(pair('NET TOTAL', money(netTotal)));
        }
        const fnbDetails = [
            item?.fnb_course_snapshot ? `Course: ${item.fnb_course_snapshot}` : '',
            modifiers.length ? `Modifiers: ${modifiers.join(', ')}` : '',
            item?.fnb_special_instructions ? `Notes: ${item.fnb_special_instructions}` : ''
        ].filter(Boolean).join(' ');
        if (fnbDetails) {
            wrapText(fnbDetails).forEach((row) => receiptRows.push(`  ${row}`.slice(0, columns)));
        }
    });

    receiptRows.push(line(), pair('TOTAL SALES', money(transaction?.subtotal_amount)));
    if (isFiscal) {
        receiptRows.push(
            pair('VATable Sales', money(transaction?.vatable_sales)),
            pair('VAT Amount (12%)', money(transaction?.vat_amount)),
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
    receiptRows.push(pair(discountLabel, negativeMoney(transaction?.discount_amount)));
    if (governedDiscount?.promo_code) {
        receiptRows.push(`Promo Code: ${safeText(governedDiscount.promo_code)}`);
    }
    if (governedDiscount?.discount_type) {
        receiptRows.push(`Discount Type: ${displayDiscountType(governedDiscount.discount_type)}`);
    }

    if (restaurantServiceChargeAmount > 0) {
        const restaurantChargeLabel = [
            transaction?.restaurant_service_charge_label_snapshot || 'Restaurant service charge',
            transaction?.restaurant_service_charge_rate_snapshot != null
                ? `@ ${Number(transaction.restaurant_service_charge_rate_snapshot).toFixed(2)}%`
                : ''
        ].filter(Boolean).join(' ');
        receiptRows.push(pair(restaurantChargeLabel, money(restaurantServiceChargeAmount)));
    }
    if (Number(transaction?.delivery_fee || 0) > 0) {
        receiptRows.push(pair('Delivery Fee', money(transaction.delivery_fee)));
    }

    receiptRows.push(
        line('='),
        pair('TOTAL AMOUNT DUE', money(transaction?.total_amount)),
        line()
    );

    receiptRows.push(
        `Payment Method: ${safeText(transaction?.payment_type, '-').replace(/_/g, ' ').toUpperCase()}`,
        `Payment Status: ${safeText(transaction?.payment_status, '-').replace(/_/g, ' ').toUpperCase()}`
    );
    if (transaction?.payment_reference) {
        receiptRows.push(`Payment Reference: ${safeText(transaction.payment_reference)}`);
    }
    if (transaction?.payment_type === 'cash') {
        receiptRows.push(
            pair('Cash Received', money(transaction?.cash_received)),
            pair('Change', money(transaction?.change_amount))
        );
    }
    const paymentBreakdown = parsePaymentBreakdown(transaction?.payment_breakdown)
        .filter((entry) => Number(entry?.amount || 0) > 0);
    if (paymentBreakdown.length > 0) {
        receiptRows.push('Payment Breakdown');
        paymentBreakdown.forEach((entry) => {
            receiptRows.push(pair(formatPaymentLabel(entry), money(entry.amount)));
        });
    }
    const deliveryProviderBreakdown = parsePaymentBreakdown(transaction?.delivery_provider_breakdown)
        .filter((entry) => Number(entry?.amount || 0) > 0);
    if (deliveryProviderBreakdown.length > 0) {
        receiptRows.push('Delivery Provider Breakdown');
        deliveryProviderBreakdown.forEach((entry) => {
            receiptRows.push(pair(formatDeliveryProviderLabel(entry), money(entry.amount)));
        });
    }
    if (transaction?.payment_type === 'employee_credit') {
        receiptRows.push(
            `Employee: ${safeText(transaction?.employee_credit_employee_name_snapshot)}`,
            pair('Credit Account', safeText(transaction?.employee_credit_account_code_snapshot)),
            pair('Credit Amount', money(transaction?.employee_credit_amount)),
            pair('Remaining Credit', money(transaction?.employee_credit_balance_after)),
            `Authorization: ${safeText(transaction?.employee_credit_authorization_reference)}`,
            'Employee Signature: ____________________'
        );
    }
    if (showSeniorPwdReceiptFields) {
        const beneficiaries = Array.isArray(governedDiscount?.beneficiaries) ? governedDiscount.beneficiaries : [];
        if (beneficiaries.length > 0) {
            beneficiaries.forEach((beneficiary, index) => receiptRows.push(
                `${safeText(beneficiary.category, 'SC/PWD').toUpperCase()} ${index + 1} ID No.: ${safeText(beneficiary.id_number)}`,
                `Name/Signature: ${safeText(beneficiary.customer_name)} __________________`
            ));
        } else {
            receiptRows.push(
                `SC/PWD/NAAC/MOV/Solo Parent ID No.: ${safeText(governedDiscount?.senior_pwd_id_number, '____________')}`,
                'Signature: __________________________'
            );
        }
    }
    receiptRows.push(line());
    if (isFiscal) {
        receiptRows.push(
            center('FISCAL RECEIPT'),
            center('Includes tax breakdown and fiscal identifiers.')
        );
    } else {
        receiptRows.push(center('This document is not an official receipt.'));
    }

    if (businessSettings.pos_receipt_footer_message) {
        pushCenteredWrapped(receiptRows, businessSettings.pos_receipt_footer_message);
    }
    receiptRows.push(center('Thank you. Please come again.'));
    receiptRows.push(center('Powered by DGFY POS'));

    return fitRows(receiptRows).join('\n');
};

export const printReceiptWithIminBridge = ({ transaction, businessSettings = {}, receiptContract = null, openDrawerAfterPrint = true, paperWidth = '80mm' }) => {
    const bridge = getIminBridge();
    if (!bridge || ![
        'printReceiptWithLogoAsync',
        'printReceiptAsync',
        'printReceiptWithLogo',
        'printReceipt'
    ].some((methodName) => typeof bridge[methodName] === 'function')) {
        return { handled: false };
    }

    const receiptText = formatIminReceiptText({ transaction, businessSettings, receiptContract, paperWidth });

    // printReceiptWithLogo carries the tenant's company icon (see IminBridge.kt /
    // ReceiptLogoProvider) in the SAME print command as the receipt text -- unlike
    // the old two-call approach (a separate printBitmap the bridge never actually
    // implemented), which would have landed on its own cut-off slip anyway, since
    // printReceipt always ends the payload with a partial cut. Older field APKs
    // without printReceiptWithLogo still print correctly via the plain printReceipt
    // fallback, just without the company icon.
    const finalizeResult = (raw) => {
        const result = parseBridgeResult(raw, 'Receipt print command sent.');

        if (!result.success) {
            return { handled: true, result: toHardwareFailureResult(result) };
        }

        emitPosHardwareMessage({
            title: 'iMin receipt printer',
            message: result.message || 'Receipt print command sent.',
            tone: 'success',
            source: 'iMin hardware',
            details: result.diagnostics || null
        });

        return { handled: true, result };
    };

    const logoSource = resolveReceiptLogoSource(businessSettings);
    if (typeof bridge.printReceiptWithLogoAsync === 'function') {
        return requestIminAsyncResult(
            (requestId) => bridge.printReceiptWithLogoAsync(
                requestId,
                receiptText,
                Boolean(openDrawerAfterPrint),
                logoSource
            ),
            'Receipt print command accepted.'
        ).then(finalizeResult);
    }

    if (typeof bridge.printReceiptAsync === 'function') {
        return requestIminAsyncResult(
            (requestId) => bridge.printReceiptAsync(
                requestId,
                receiptText,
                Boolean(openDrawerAfterPrint)
            ),
            'Receipt print command accepted.'
        ).then(finalizeResult);
    }

    const raw = typeof bridge.printReceiptWithLogo === 'function'
        ? bridge.printReceiptWithLogo(receiptText, Boolean(openDrawerAfterPrint), logoSource)
        : bridge.printReceipt(receiptText, Boolean(openDrawerAfterPrint));

    return finalizeResult(raw);
};

export const printTestReceiptWithIminBridge = ({ message = 'DGFY POS printer test', terminalId = '' } = {}) => {
    const bridge = getIminBridge();
    if (!bridge || (
        typeof bridge.printReceiptAsync !== 'function'
        && typeof bridge.printReceipt !== 'function'
    )) {
        return { handled: false };
    }

    const receiptText = [
        center('DGFY POS'),
        center('PRINTER TEST'),
        line(),
        pair('Terminal', safeText(terminalId, 'Unassigned')),
        pair('Message', safeText(message, 'DGFY POS printer test')),
        pair('Time', new Date().toLocaleString('en-US')),
        line(),
        center('No sale recorded.'),
        center('Printer connection is working.')
    ].join('\n');
    const raw = sendIminTextPrint({
        bridge,
        receiptText,
        fallbackMessage: 'Printer test page sent.'
    });

    return mapMaybePromise(raw, (value) => {
        const result = parseBridgeResult(value, 'Printer test page sent.');
        const normalizedResult = result.success ? result : toHardwareFailureResult(result);
        emitPosHardwareMessage({
            title: 'iMin receipt printer',
            message: normalizedResult.message || 'Printer test page sent.',
            tone: normalizedResult.success ? 'success' : 'error',
            source: 'iMin hardware',
            details: normalizedResult.diagnostics || null
        });
        return { handled: true, result: normalizedResult };
    });
};

const resolveOrderTicketItemName = (cartLine, index) => safeText(
    cartLine?.item_name
    || cartLine?.item?.name
    || cartLine?.item_snapshot?.name
    || cartLine?.name
    || cartLine?.itemName,
    `Item #${cartLine?.item_id || index + 1}`
);

const formatShiftSummaryMoney = (value) => value == null ? '-' : money(value);
const formatShiftSummaryCount = (value) => Number(value || 0).toLocaleString('en-US');
const paymentBreakdownLabel = (entry) => safeText(
    entry?.payment_label || entry?.payment_type,
    'Other'
);
const shiftSummaryEntryCount = (entry) => Number(entry?.count ?? entry?.transaction_count ?? entry?.total_transactions ?? 0);
const shiftSummaryEntryAmount = (entry) => Number(entry?.amount ?? entry?.net_sales ?? 0);
const hasShiftSummaryValue = (entry) => shiftSummaryEntryCount(entry) > 0 || shiftSummaryEntryAmount(entry) > 0;
const orderMethodSummaryLabel = (value) => ({
    dine_in: 'Dine In',
    takeout: 'Takeout',
    pickup: 'Pickup',
    delivery: 'Delivery',
    online: 'Online'
}[String(value || '').trim().toLowerCase()] || String(value || '').replace(/[_-]/g, ' ') || 'Other');
const orderSourceSummaryLabel = (entry) => (
    safeText(entry?.source_label)
    || (String(entry?.order_source || '').trim().toLowerCase() === 'online_store' ? 'Online Sales' : 'Walk-in Sales')
);
const deliveryProviderSummaryLabel = (entry) => {
    const providerType = safeText(entry?.provider_type).toLowerCase();
    if (providerType === 'other') return `${safeText(entry?.provider_name, 'Other')} (Other)`;
    if (providerType === 'foodpanda') return 'Foodpanda';
    if (providerType === 'grab') return 'Grab';
    return safeText(entry?.display_label || providerType, 'Delivery provider');
};
const formatHardwareDateTime = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Manila'
    });
};

export const formatIminShiftSummaryText = ({ shiftSummary = {}, businessSettings = {}, paperWidth = '80mm', readingType = 'shift_summary' } = {}) => {
    const {
        line,
        center,
        pair,
        fitRows
    } = createTextLayout(paperWidth);
    const shift = shiftSummary?.shift || {};
    const cash = shiftSummary?.cash_summary || {};
    const sales = shiftSummary?.sales_summary || {};
    const paymentBreakdown = (Array.isArray(sales.payment_breakdown) ? sales.payment_breakdown : [])
        .filter(hasShiftSummaryValue);
    const orderSources = (Array.isArray(sales.order_source_breakdown) ? sales.order_source_breakdown : [])
        .filter(hasShiftSummaryValue);
    const orderMethods = (Array.isArray(sales.order_method_breakdown) ? sales.order_method_breakdown : [])
        .filter(hasShiftSummaryValue);
    const deliveryProviders = parsePaymentBreakdown(sales.delivery_provider_breakdown)
        .filter(hasShiftSummaryValue);
    const isXReading = readingType === 'x_reading';
    const lines = [
        center(safeText(businessSettings?.pos_business_name, 'DGFY')),
        center(isXReading ? 'X-READING / CURRENT SHIFT' : 'CASHIER SHIFT SALES SUMMARY'),
        `Business date: ${safeText(shift.business_date)}`,
        `Terminal: ${safeText(shift.terminal_id)}`,
        `Shift: ${safeText(shift.pos_terminal_shift_id)}`,
        ...(shiftSummary.generated_at ? [`Generated: ${formatHardwareDateTime(shiftSummary.generated_at)}`] : []),
        line(),
        center('SALES SUMMARY'),
        pair(isXReading ? 'Net sales' : 'Overall sales', formatShiftSummaryMoney(sales.total_amount)),
        pair('Transactions', formatShiftSummaryCount(sales.transaction_count)),
        pair('Items sold', formatShiftSummaryCount(sales.item_count)),
        pair('Subtotal', formatShiftSummaryMoney(sales.subtotal_amount)),
        pair('Discounts', formatShiftSummaryMoney(sales.discount_amount)),
        pair('VATable sales', formatShiftSummaryMoney(sales.vatable_sales)),
        pair('VAT', formatShiftSummaryMoney(sales.vat_amount)),
        pair('VAT-exempt sales', formatShiftSummaryMoney(sales.vat_exempt_sales)),
        pair('Zero-rated sales', formatShiftSummaryMoney(sales.zero_rated_sales)),
        pair(`POS voids (${formatShiftSummaryCount(sales.void_transaction_count)})`, formatShiftSummaryMoney(sales.transaction_void_amount ?? sales.void_amount)),
        pair(`Item voids (${formatShiftSummaryCount(sales.item_voided_item_count)})`, formatShiftSummaryMoney(sales.item_void_amount ?? 0)),
        pair('Total voids', formatShiftSummaryMoney(sales.void_amount)),
        pair('Refunds', formatShiftSummaryMoney(sales.refund_amount)),
        line(),
        center('PAYMENT METHODS')
    ];
    if (paymentBreakdown.length === 0) {
        lines.push(center('No payments recorded'));
    } else {
        paymentBreakdown.forEach((entry) => {
            lines.push(pair(`${paymentBreakdownLabel(entry)} (${formatShiftSummaryCount(shiftSummaryEntryCount(entry))})`, formatShiftSummaryMoney(shiftSummaryEntryAmount(entry))));
        });
    }
    if (orderSources.length > 0) {
        lines.push(line(), center('SALES SOURCES'));
        orderSources.forEach((entry) => {
            lines.push(pair(`${orderSourceSummaryLabel(entry)} (${formatShiftSummaryCount(shiftSummaryEntryCount(entry))})`, formatShiftSummaryMoney(shiftSummaryEntryAmount(entry))));
        });
    }
    if (orderMethods.length > 0) {
        lines.push(line(), center('ORDER METHODS'));
        orderMethods.forEach((entry) => {
            lines.push(pair(`${orderMethodSummaryLabel(entry.order_method)} (${formatShiftSummaryCount(shiftSummaryEntryCount(entry))})`, formatShiftSummaryMoney(shiftSummaryEntryAmount(entry))));
        });
    }
    lines.push(line(), center('DELIVERY PROVIDERS'));
    if (deliveryProviders.length === 0) {
        lines.push(pair('No delivery provider sales', '0'));
    } else {
        deliveryProviders.forEach((entry) => {
            lines.push(pair(`${deliveryProviderSummaryLabel(entry)} (${formatShiftSummaryCount(shiftSummaryEntryCount(entry))})`, formatShiftSummaryMoney(shiftSummaryEntryAmount(entry))));
        });
    }
    lines.push(
        line(),
        center('CASH RECONCILIATION'),
        pair('Opening/petty cash', formatShiftSummaryMoney(cash.opening_float_amount)),
        pair('Cash sales', formatShiftSummaryMoney(cash.cash_sales_amount)),
        pair('Cash in', formatShiftSummaryMoney(cash.cash_in_total)),
        pair('Cash out', formatShiftSummaryMoney(cash.cash_out_total)),
        pair('Expected cash in drawer', formatShiftSummaryMoney(cash.expected_cash_amount)),
        pair('Closing cash', formatShiftSummaryMoney(cash.closing_cash_amount)),
        pair('Variance', formatShiftSummaryMoney(cash.cash_variance_amount)),
        line()
    );
    return fitRows(lines).join('\n');
};

export const printShiftSummaryWithIminBridge = ({ shiftSummary, businessSettings = {}, paperWidth = '80mm', readingType = 'shift_summary' }) => {
    const bridge = getIminBridge();
    if (!bridge || (
        typeof bridge.printReceiptAsync !== 'function'
        && typeof bridge.printReceipt !== 'function'
    )) {
        return { handled: false };
    }

    const raw = sendIminTextPrint({
        bridge,
        receiptText: formatIminShiftSummaryText({ shiftSummary, businessSettings, paperWidth, readingType }),
        fallbackMessage: 'Shift sales summary print command sent.'
    });
    return mapMaybePromise(raw, (value) => {
        const result = parseBridgeResult(value, 'Shift sales summary print command sent.');
        const normalizedResult = result.success ? result : toHardwareFailureResult(result);
        emitPosHardwareMessage({
            title: 'iMin receipt printer',
            message: normalizedResult.message || 'Shift sales summary print command sent.',
            tone: normalizedResult.success ? 'success' : 'error',
            source: 'iMin hardware',
            details: normalizedResult.diagnostics || null
        });
        return { handled: true, result: normalizedResult };
    });
};

const formatZReadingValue = (value) => money(value);
const formatZReadingGeneratedAt = formatHardwareDateTime;
const formatZReadingReconciliationStatus = (value) => ({
    matched: 'MATCHED',
    variance: 'VARIANCE FOUND',
    not_generated: 'NOT GENERATED',
    not_comparable: 'COMPARISON UNAVAILABLE'
}[safeText(value).toLowerCase()] || 'COMPARISON UNAVAILABLE');
const formatOptionalZReadingValue = (value) => (
    value === null || value === undefined ? '-' : formatZReadingValue(value)
);
const formatZReadingDeduction = (value) => {
    if (value === null || value === undefined) return '-';
    const amount = Number(value || 0);
    return `${amount > 0 ? '-' : ''}${formatZReadingValue(amount)}`;
};

export const formatIminZReadingText = ({ zReading = {}, businessSettings = {}, paperWidth = '80mm' } = {}) => {
    const {
        line,
        center,
        pair,
        fitRows
    } = createTextLayout(paperWidth);
    const reading = zReading?.z_reading || {};
    const summary = reading?.summary || {};
    const reconciliation = reading?.reconciliation || reading?.z_reading_reconciliation || null;
    const paymentBreakdown = Array.isArray(summary.payment_breakdown) ? summary.payment_breakdown : [];
    const orderSources = Array.isArray(summary.order_source_breakdown) ? summary.order_source_breakdown : [];
    const orderMethods = Array.isArray(summary.order_method_breakdown) ? summary.order_method_breakdown : [];
    const deliveryProviders = parsePaymentBreakdown(summary.delivery_provider_breakdown)
        .filter(hasShiftSummaryValue);
    const cashSummary = getDailySalesCheckCashSummary({
        z_payment_breakdown: paymentBreakdown,
        report_cash_refunds_voids: reconciliation?.report_cash_refunds_voids,
        report_refunds_voids: reconciliation?.report_refunds_voids
    });
    const voidActivity = getDailySalesCheckVoidActivity({
        report_voided_refunded_transactions: reconciliation?.report_voided_refunded_transactions,
        z_void_transaction_count: reconciliation?.z_void_transaction_count ?? summary.void_transaction_count,
        report_refunds_voids: reconciliation?.report_refunds_voids,
        z_void_amount: reconciliation?.z_void_amount ?? summary.void_amount
    });
    const formatVoidActivity = () => {
        if (!voidActivity.available) return '-';
        const count = voidActivity.count == null ? '-' : formatShiftSummaryCount(voidActivity.count);
        const amount = voidActivity.amount == null ? '-' : formatZReadingValue(voidActivity.amount);
        return `${count} / ${amount}`;
    };
    const lines = [
        center(safeText(businessSettings?.pos_business_name, 'DGFY')),
        center('Z-READING / CLOSE DAY'),
        `Business date: ${safeText(reading.business_date)}`,
        `Location: ${safeText(reading.location_id)}`,
        `Reading: ${safeText(reading.reading_identifier)}`,
        `Generated: ${formatZReadingGeneratedAt(reading.generated_at)}`,
        line(),
        pair('Transactions', summary.transaction_count || 0),
        pair('Items sold', summary.item_count || 0),
        pair('Subtotal', formatZReadingValue(summary.subtotal_amount)),
        pair('Discounts', formatZReadingValue(summary.discount_amount)),
        pair('VATable sales', formatZReadingValue(summary.vatable_sales)),
        pair('VAT', formatZReadingValue(summary.vat_amount)),
        pair('VAT-exempt sales', formatZReadingValue(summary.vat_exempt_sales)),
        pair('Zero-rated sales', formatZReadingValue(summary.zero_rated_sales)),
        pair('Overall total', formatZReadingValue(summary.total_amount)),
        pair(`POS voids (${summary.void_transaction_count || 0})`, formatZReadingValue(summary.transaction_void_amount ?? summary.void_amount)),
        pair(`Item voids (${summary.item_voided_item_count || 0})`, formatZReadingValue(summary.item_void_amount ?? 0)),
        pair('Total voids', formatZReadingValue(summary.void_amount)),
        pair('Refunds', formatZReadingValue(summary.refund_amount)),
        ...(reconciliation ? [
            line(),
            center('REPORT RECONCILIATION'),
            pair('Status', formatZReadingReconciliationStatus(reconciliation.status)),
            pair('Report recognized sales', formatOptionalZReadingValue(reconciliation.report_recognized_sales)),
            pair('Z-reading total', formatOptionalZReadingValue(reconciliation.z_total_amount)),
            pair('Difference', formatOptionalZReadingValue(reconciliation.variance)),
            pair('Report net sales', formatOptionalZReadingValue(reconciliation.report_net_sales)),
            ...(cashSummary.available ? [
                pair('Cash before refunds', formatZReadingValue(cashSummary.cashPaymentsBeforeRefunds)),
                pair('Cash refunds / voids', formatZReadingDeduction(cashSummary.cashRefundsVoids)),
                pair('Net cash sales', formatZReadingValue(cashSummary.netCashSales))
            ] : []),
            pair('Void/refund activity', formatVoidActivity()),
            pair('Refunds/voids deducted', formatZReadingDeduction(reconciliation.report_refunds_voids)),
            pair('Audit adjustments (ref.)', formatOptionalZReadingValue(reconciliation.report_adjustment_amount)),
            center('Audit adjustments: reference only'),
            ...(reconciliation.evaluated_at ? [pair('Checked', formatZReadingGeneratedAt(reconciliation.evaluated_at))] : [])
        ] : []),
        line(),
        center('PAYMENT BREAKDOWN'),
        center('PAYMENTS BEFORE REFUNDS/VOIDS')
    ];
    if (paymentBreakdown.length === 0) {
        lines.push(pair('No payments', '0'));
    } else {
        paymentBreakdown.forEach((entry) => {
            lines.push(pair(`${isCashPayment(entry) ? 'Cash before refunds' : paymentBreakdownLabel(entry)} (${formatShiftSummaryCount(entry.count)})`, formatZReadingValue(entry.amount)));
        });
    }
    lines.push(line(), center('SALES SOURCE BREAKDOWN'));
    if (orderSources.length === 0) {
        lines.push(pair('No source sales', '0'));
    } else {
        orderSources.forEach((entry) => {
            lines.push(pair(`${orderSourceSummaryLabel(entry)} (${formatShiftSummaryCount(shiftSummaryEntryCount(entry))})`, formatZReadingValue(shiftSummaryEntryAmount(entry))));
        });
    }
    lines.push(line(), center('ORDER METHOD BREAKDOWN'));
    if (orderMethods.length === 0) {
        lines.push(pair('No order methods', '0'));
    } else {
        orderMethods.forEach((entry) => {
            lines.push(pair(`${orderMethodSummaryLabel(entry.order_method)} (${formatShiftSummaryCount(shiftSummaryEntryCount(entry))})`, formatZReadingValue(shiftSummaryEntryAmount(entry))));
        });
    }
    lines.push(line(), center('DELIVERY PROVIDER BREAKDOWN'));
    if (deliveryProviders.length === 0) {
        lines.push(pair('No delivery provider sales', '0'));
    } else {
        deliveryProviders.forEach((entry) => {
            lines.push(pair(`${deliveryProviderSummaryLabel(entry)} (${formatShiftSummaryCount(shiftSummaryEntryCount(entry))})`, formatZReadingValue(shiftSummaryEntryAmount(entry))));
        });
    }
    lines.push(
        line(),
        center('FISCAL COUNTERS'),
        pair('Z counter', reading.z_counter_value || 0),
        pair('Reset counter', reading.reset_counter_value || 0),
        pair('Lifetime grand total', formatZReadingValue(
            reading.lifetime_grand_total == null
                ? Number(reading.lifetime_grand_total_cents || 0) / 100
                : reading.lifetime_grand_total
        )),
        line()
    );
    return fitRows(lines).join('\n');
};

export const printZReadingWithIminBridge = ({ zReading, businessSettings = {}, paperWidth = '80mm' }) => {
    const bridge = getIminBridge();
    if (!bridge || (
        typeof bridge.printReceiptAsync !== 'function'
        && typeof bridge.printReceipt !== 'function'
    )) {
        return { handled: false };
    }

    const raw = sendIminTextPrint({
        bridge,
        receiptText: formatIminZReadingText({ zReading, businessSettings, paperWidth }),
        fallbackMessage: 'Z-reading print command sent.'
    });
    return mapMaybePromise(raw, (value) => {
        const result = parseBridgeResult(value, 'Z-reading print command sent.');
        const normalizedResult = result.success ? result : toHardwareFailureResult(result);
        emitPosHardwareMessage({
            title: 'iMin receipt printer',
            message: normalizedResult.message || 'Z-reading print command sent.',
            tone: normalizedResult.success ? 'success' : 'error',
            source: 'iMin hardware',
            details: normalizedResult.diagnostics || null
        });
        return { handled: true, result: normalizedResult };
    });
};

export const formatIminOrderTicketText = ({
    cart = [],
    terminalId = '',
    orderMethod = '',
    fnbContext = null,
    orderNotes = '',
    paperWidth = '80mm'
}) => {
    const {
        columns,
        line,
        center,
        wrapText,
        pushCenteredWrapped,
        fitRows
    } = createTextLayout(paperWidth);
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
                ? `Table: ${fnbContext.table_label || fnbContext.fnb_table_label_snapshot}`
                : ''
        ].filter(Boolean);
        pushCenteredWrapped(rows, fnbParts.join(' '));
    }

    const normalizedOrderNotes = safeText(
        orderNotes
        || fnbContext?.kitchen_notes
        || fnbContext?.order_notes
        || fnbContext?.notes
        || fnbContext?.special_instructions
    );
    if (normalizedOrderNotes) {
        wrapText(`Kitchen note: ${normalizedOrderNotes}`).forEach((row) => rows.push(row));
    }

    rows.push(line('='));

    cart.forEach((cartLine, index) => {
        const quantity = Number(cartLine?.quantity || 0);
        const itemName = resolveOrderTicketItemName(cartLine, index);
        rows.push(`${quantity.toFixed(quantity % 1 === 0 ? 0 : 2)} x ${itemName}`.slice(0, columns));

        const course = safeText(cartLine?.course || cartLine?.fnb_course_snapshot);
        if (course) {
            wrapText(`Course: ${course}`).forEach((row) => rows.push(`  ${row}`.slice(0, columns)));
        }

        const modifiers = Array.isArray(cartLine?.line_modifiers)
            ? cartLine.line_modifiers.map((modifier) => (
                modifier?.option_name || modifier?.name || modifier?.modifier_name
            )).filter(Boolean)
            : parseArrayMetadata(cartLine?.fnb_modifiers_snapshot)
                .map((modifier) => modifier?.option_name || modifier?.name)
                .filter(Boolean);
        if (modifiers.length) {
            wrapText(`Modifiers: ${modifiers.join(', ')}`).forEach((row) => rows.push(`  ${row}`.slice(0, columns)));
        }

        const specialRequest = safeText(
            cartLine?.special_instructions || cartLine?.fnb_special_instructions || cartLine?.notes
        );
        if (specialRequest) {
            wrapText(`Special request: ${specialRequest}`).forEach((row) => rows.push(`  ${row}`.slice(0, columns)));
        }

        rows.push(line());
    });

    rows.push(center('Kitchen / Order Copy'));
    return fitRows(rows).join('\n');
};

export const formatIminBillRequestText = ({
    cart = [],
    terminalId = '',
    orderMethod = '',
    fnbContext = null,
    orderNotes = '',
    billTotal = null,
    paperWidth = '80mm'
}) => {
    const {
        line,
        center,
        pair,
        wrapText,
        pushCenteredWrapped,
        fitRows
    } = createTextLayout(paperWidth);
    const rows = [
        center('DGFY'),
        center('BILL REQUEST'),
        center(new Date().toLocaleString())
    ];

    if (terminalId) rows.push(center(`Terminal: ${terminalId}`));
    if (orderMethod) rows.push(center(`Order: ${String(orderMethod).replace(/_/g, ' ')}`));
    if (fnbContext?.fnb_check_id || fnbContext?.table_label || fnbContext?.fnb_table_label_snapshot) {
        const fnbParts = [
            fnbContext?.fnb_check_id ? `F&B Check #${fnbContext.fnb_check_id}` : '',
            fnbContext?.table_label || fnbContext?.fnb_table_label_snapshot
                ? `Table: ${fnbContext.table_label || fnbContext.fnb_table_label_snapshot}`
                : ''
        ].filter(Boolean);
        pushCenteredWrapped(rows, fnbParts.join(' '));
    }

    const normalizedOrderNotes = safeText(orderNotes || fnbContext?.order_notes || fnbContext?.special_instructions);
    if (normalizedOrderNotes) {
        wrapText(`Kitchen note: ${normalizedOrderNotes}`).forEach((row) => rows.push(row));
    }

    rows.push(line('='));
    rows.push(pair('Item / Qty', 'Unit price'));
    rows.push(line());

    let calculatedTotal = 0;
    cart.forEach((cartLine, index) => {
        const quantity = Number(cartLine?.quantity || 0);
        const unitPrice = Number(cartLine?.sale_price || cartLine?.unit_price || 0);
        calculatedTotal += quantity * unitPrice;
        const itemName = resolveOrderTicketItemName(cartLine, index);
        wrapText(`${quantity.toFixed(quantity % 1 === 0 ? 0 : 2)} x ${itemName}`).forEach((row) => rows.push(row));
        rows.push(pair('  Price', money(unitPrice)));
        rows.push(line());
    });

    const total = Number.isFinite(Number(billTotal)) ? Number(billTotal) : calculatedTotal;
    rows.push(pair('Overall price', money(total)));
    rows.push(center('No payment recorded'));
    return fitRows(rows).join('\n');
};

export const printOrderWithIminBridge = ({
    cart = [],
    terminalId = '',
    orderMethod = '',
    fnbContext = null,
    orderNotes = '',
    billRequest = false,
    billTotal = null,
    paperWidth = '80mm'
}) => {
    const bridge = getIminBridge();
    if (!bridge || (
        typeof bridge.printReceiptAsync !== 'function'
        && typeof bridge.printReceipt !== 'function'
    )) {
        return { handled: false };
    }

    const fallbackMessage = billRequest
        ? 'Bill request print command sent.'
        : 'Order ticket print command sent.';
    const raw = sendIminTextPrint({
        bridge,
        receiptText: billRequest
            ? formatIminBillRequestText({ cart, terminalId, orderMethod, fnbContext, orderNotes, billTotal, paperWidth })
            : formatIminOrderTicketText({ cart, terminalId, orderMethod, fnbContext, orderNotes, paperWidth }),
        fallbackMessage
    });
    return mapMaybePromise(raw, (value) => {
        const result = parseBridgeResult(value, fallbackMessage);
        if (!result.success) {
            return { handled: true, result: toHardwareFailureResult(result) };
        }

        emitPosHardwareMessage({
            title: 'iMin order printer',
            message: result.message || fallbackMessage,
            tone: 'success',
            source: 'iMin hardware',
            details: result.diagnostics || null
        });

        return { handled: true, result };
    });
};

export const openDrawerWithIminBridge = () => {
    const bridge = getIminBridge();
    if (!bridge || (
        typeof bridge.openCashDrawerAsync !== 'function'
        && typeof bridge.openCashDrawer !== 'function'
    )) {
        return { handled: false };
    }

    const raw = typeof bridge.openCashDrawerAsync === 'function'
        ? requestIminAsyncResult(
            (requestId) => bridge.openCashDrawerAsync(requestId),
            'Cash drawer open command accepted.'
        )
        : bridge.openCashDrawer();
    return mapMaybePromise(raw, (value) => {
        const result = parseBridgeResult(value, 'Cash drawer open command sent.');
        if (!result.success) {
            return { handled: true, result: toHardwareFailureResult(result) };
        }

        emitPosHardwareMessage({
            title: 'iMin cash drawer',
            message: result.message || 'Cash drawer open command sent.',
            tone: 'success',
            source: 'iMin hardware',
            details: result.diagnostics || null
        });

        return { handled: true, result };
    });
};

// silent: true skips the emitPosHardwareMessage announcement -- used by the
// printer-availability probe (iminPrinterAvailability.js), which polls this
// on every terminal mount/refresh and must not surface a message each time.
export const getIminHardwareDiagnostics = ({ silent = false } = {}) => {
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
    if (!silent) {
        emitPosHardwareMessage({
            title: 'iMin hardware diagnostics',
            message: diagnostics.result?.message || 'iMin hardware diagnostics loaded.',
            tone: diagnostics.result?.success === false ? 'error' : 'info',
            source: 'iMin hardware',
            details: diagnostics.result?.diagnostics || null
        });
    }
    return diagnostics;
};

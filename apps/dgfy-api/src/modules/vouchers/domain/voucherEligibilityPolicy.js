// Pure voucher eligibility evaluation. Zero imports, same discipline as `voucherBenefitPolicy.js`.
//
// Adapted from the wrap-around time arithmetic in
// `modules/shared/utils/commercialPromoPolicy.js`'s `isActiveTime`, with both of that function's
// fail-OPEN branches deliberately inverted:
//
//   | condition                    | promo engine | here                              |
//   |------------------------------|--------------|-----------------------------------|
//   | `start === end`              | eligible     | VOUCHER_TIME_WINDOW_DEGENERATE    |
//   | timezone unresolvable        | eligible     | VOUCHER_TIMEZONE_UNRESOLVABLE     |
//
// ADR 0066 decision 3 is `[binding]`: checkout fails closed. A degenerate or unevaluatable window
// must block, not wave through -- the promo engine's behavior is a bug this module must not inherit.
// The inclusive-on-both-bounds comparison IS inherited intentionally, so a promo migrated to a
// voucher in a later phase keeps the same boundary semantics.
//
// This module never throws: it returns `{ eligible, reasons[] }` and evaluates every check, so a
// caller can show a merchant all the reasons at once instead of one per round trip.

export const VOUCHER_CHANNEL_BITS = Object.freeze({ storefront: 1, pos: 2 });
export const VOUCHER_FULFILLMENT_BITS = Object.freeze({ delivery: 1, pickup: 2 });
export const VOUCHER_ORDER_TIMING_BITS = Object.freeze({ asap: 1, scheduled: 2 });
// Index 0 = Sunday, matching `Date#getDay()` and the `weekday_mask` encoding in ADR 0066 decision 10.
export const VOUCHER_WEEKDAY_BITS = Object.freeze([1, 2, 4, 8, 16, 32, 64]);
export const VOUCHER_WEEKDAY_MASK_ALL = 127;
export const DEFAULT_VOUCHER_TIMEZONE = 'Asia/Manila';
export const VOUCHER_STATUSES = Object.freeze(['draft', 'active', 'paused', 'expired', 'archived']);

export const VOUCHER_ELIGIBILITY_REASON_CODES = Object.freeze({
    VOUCHER_NOT_FOUND: 'VOUCHER_NOT_FOUND',
    VOUCHER_NOT_ACTIVE: 'VOUCHER_NOT_ACTIVE',
    VOUCHER_NOT_STARTED: 'VOUCHER_NOT_STARTED',
    VOUCHER_EXPIRED: 'VOUCHER_EXPIRED',
    VOUCHER_WEEKDAY_NOT_ELIGIBLE: 'VOUCHER_WEEKDAY_NOT_ELIGIBLE',
    VOUCHER_TIME_WINDOW_BLOCKED: 'VOUCHER_TIME_WINDOW_BLOCKED',
    VOUCHER_TIME_WINDOW_DEGENERATE: 'VOUCHER_TIME_WINDOW_DEGENERATE',
    VOUCHER_TIMEZONE_UNRESOLVABLE: 'VOUCHER_TIMEZONE_UNRESOLVABLE',
    VOUCHER_CHANNEL_NOT_ELIGIBLE: 'VOUCHER_CHANNEL_NOT_ELIGIBLE',
    VOUCHER_FULFILLMENT_NOT_ELIGIBLE: 'VOUCHER_FULFILLMENT_NOT_ELIGIBLE',
    VOUCHER_ORDER_TIMING_NOT_ELIGIBLE: 'VOUCHER_ORDER_TIMING_NOT_ELIGIBLE',
    VOUCHER_MIN_SPEND_NOT_MET: 'VOUCHER_MIN_SPEND_NOT_MET',
    VOUCHER_MIN_QUANTITY_NOT_MET: 'VOUCHER_MIN_QUANTITY_NOT_MET',
    VOUCHER_REDEMPTION_LIMIT_REACHED: 'VOUCHER_REDEMPTION_LIMIT_REACHED',
    VOUCHER_BUDGET_EXHAUSTED: 'VOUCHER_BUDGET_EXHAUSTED',
    VOUCHER_QUANTITY_LIMIT_REACHED: 'VOUCHER_QUANTITY_LIMIT_REACHED'
});

const REASON = VOUCHER_ELIGIBILITY_REASON_CODES;
const TIME_24H_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAY_INDEX_BY_SHORT_NAME = Object.freeze({
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
});

export const hasMaskBit = (mask, bit) => {
    const numericMask = Number(mask);
    const numericBit = Number(bit);
    if (!Number.isFinite(numericMask) || !Number.isFinite(numericBit) || numericBit === 0) return false;
    return (numericMask & numericBit) === numericBit;
};

const toMinutes = (value) => {
    const match = String(value ?? '').trim().match(TIME_24H_PATTERN);
    return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
};

const toDateOnly = (value) => {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    }
    const text = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

/**
 * Resolve "now" into the tenant timezone once: calendar date, minutes-since-midnight, and weekday
 * index all come from a single `Intl.DateTimeFormat` pass.
 *
 * Computing the weekday in the tenant timezone rather than UTC is not cosmetic: a Saturday 22:00 UTC
 * instant is already Sunday in Asia/Manila (UTC+8), so a Sunday-only voucher evaluated in UTC would
 * be wrong for eight hours a week. Covered directly by a unit test.
 *
 * @returns {{date: string, minutes: number, weekdayIndex: number}|null} null when the timezone cannot
 *          be resolved -- callers must treat that as fail-closed.
 */
const resolveZonedNow = (now, timezone) => {
    const instant = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(instant.getTime())) return null;

    try {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            weekday: 'short'
        }).formatToParts(instant).map((part) => [part.type, part.value]));

        // Some ICU builds render midnight as hour "24" under hour12:false; the modulo keeps
        // minutes-since-midnight inside [0, 1440).
        const hour = Number(parts.hour) % 24;
        const minute = Number(parts.minute);
        const weekdayIndex = WEEKDAY_INDEX_BY_SHORT_NAME[parts.weekday];

        if (!Number.isFinite(hour) || !Number.isFinite(minute) || weekdayIndex === undefined) return null;
        if (!parts.year || !parts.month || !parts.day) return null;

        return {
            date: `${parts.year}-${parts.month}-${parts.day}`,
            minutes: (hour * 60) + minute,
            weekdayIndex
        };
    } catch {
        return null;
    }
};

/**
 * The status a voucher actually has right now, as opposed to the one stored in its row.
 *
 * `expired` is derived, never client-settable: a voucher stored `active` whose `valid_until` has
 * passed in the tenant timezone reads as `expired`. Everything else returns the stored status
 * unchanged -- in particular a `draft` past its window stays `draft`, because drafts were never live
 * and "expired draft" would be a lie about history.
 *
 * When the timezone cannot be resolved this returns the STORED status rather than `expired`. That is
 * deliberate and is not a fail-open hole: lazy expiry materializes this value with a real UPDATE, so
 * deriving `expired` from a misconfigured timezone would permanently kill live campaigns. The
 * fail-closed half lives in `evaluateVoucherEligibility`, which emits
 * VOUCHER_TIMEZONE_UNRESOLVABLE and blocks.
 */
export const deriveVoucherStatus = ({ voucher, now = new Date(), timezone = DEFAULT_VOUCHER_TIMEZONE } = {}) => {
    const storedStatus = String(voucher?.status || 'draft');
    if (storedStatus !== 'active') return storedStatus;

    const validUntil = toDateOnly(voucher?.valid_until);
    if (!validUntil) return storedStatus;

    const zoned = resolveZonedNow(now, timezone);
    if (!zoned) return storedStatus;

    return zoned.date > validUntil ? 'expired' : 'active';
};

/**
 * Evaluate every eligibility condition on a voucher against a redemption context.
 *
 * Collect-all, never short-circuit. Checks 11-13 (the three exhaustion limits) are PREVIEW ONLY:
 * they read `vouchers.redeemed_*`, which ADR 0066 decision 4 makes a derived cache, not the source of
 * truth. Actual enforcement is Phase 105's single atomic conditional UPDATE against the ledger.
 *
 * @returns {{eligible: boolean, reasons: Array<{reason_code: string, message: string, details: Object}>}}
 */
export const evaluateVoucherEligibility = ({ voucher, context = {} } = {}) => {
    const reasons = [];
    const addReason = (reasonCode, message, details = {}) => {
        if (reasons.some((reason) => reason.reason_code === reasonCode)) return;
        reasons.push({ reason_code: reasonCode, message, details });
    };

    if (!voucher) {
        addReason(REASON.VOUCHER_NOT_FOUND, 'Voucher not found.');
        return { eligible: false, reasons };
    }

    const timezone = context.timezone || DEFAULT_VOUCHER_TIMEZONE;
    const now = context.now instanceof Date ? context.now : new Date(context.now ?? Date.now());
    const zoned = resolveZonedNow(now, timezone);

    // 1. Status (derived, so a stored-active-but-elapsed voucher reads as expired).
    const derivedStatus = deriveVoucherStatus({ voucher, now, timezone });
    if (derivedStatus !== 'active') {
        if (derivedStatus === 'expired') {
            addReason(REASON.VOUCHER_EXPIRED, 'Voucher has expired.', {
                valid_until: toDateOnly(voucher.valid_until)
            });
        } else {
            addReason(REASON.VOUCHER_NOT_ACTIVE, `Voucher is not active (status: ${derivedStatus}).`, {
                status: derivedStatus
            });
        }
    }

    // Fail closed on an unresolvable timezone: every date/time/weekday check below depends on it, so
    // an unevaluatable window blocks rather than passes (ADR 0066 decision 3, `[binding]`).
    if (!zoned) {
        addReason(
            REASON.VOUCHER_TIMEZONE_UNRESOLVABLE,
            'Voucher time window could not be evaluated: the tenant timezone is unresolvable.',
            { timezone }
        );
    }

    // 2-3. Validity date window, evaluated in the tenant timezone.
    const validFrom = toDateOnly(voucher.valid_from);
    const validUntil = toDateOnly(voucher.valid_until);
    if (zoned && validFrom && zoned.date < validFrom) {
        addReason(REASON.VOUCHER_NOT_STARTED, 'Voucher is not valid yet.', {
            valid_from: validFrom,
            evaluated_date: zoned.date
        });
    }
    if (zoned && validUntil && zoned.date > validUntil) {
        addReason(REASON.VOUCHER_EXPIRED, 'Voucher has expired.', {
            valid_until: validUntil,
            evaluated_date: zoned.date
        });
    }

    // 4. Weekday mask.
    if (zoned && !hasMaskBit(voucher.weekday_mask, VOUCHER_WEEKDAY_BITS[zoned.weekdayIndex])) {
        addReason(REASON.VOUCHER_WEEKDAY_NOT_ELIGIBLE, 'Voucher is not valid on this day of the week.', {
            weekday_mask: Number(voucher.weekday_mask),
            weekday_index: zoned.weekdayIndex
        });
    }

    // 5. Time-of-day window (fail-closed adaptation of the promo engine's isActiveTime).
    const startMinutes = toMinutes(voucher.valid_time_start);
    const endMinutes = toMinutes(voucher.valid_time_end);
    if (startMinutes != null && endMinutes != null) {
        if (startMinutes === endMinutes) {
            addReason(
                REASON.VOUCHER_TIME_WINDOW_DEGENERATE,
                'Voucher time window is degenerate (start equals end) and cannot be evaluated.',
                { valid_time_start: voucher.valid_time_start, valid_time_end: voucher.valid_time_end }
            );
        } else if (zoned) {
            const current = zoned.minutes;
            const withinWindow = startMinutes < endMinutes
                ? current >= startMinutes && current <= endMinutes
                : current >= startMinutes || current <= endMinutes;
            if (!withinWindow) {
                addReason(REASON.VOUCHER_TIME_WINDOW_BLOCKED, 'Voucher is not valid at this time of day.', {
                    valid_time_start: voucher.valid_time_start,
                    valid_time_end: voucher.valid_time_end,
                    evaluated_minutes: current
                });
            }
        }
        // `zoned === null` already recorded VOUCHER_TIMEZONE_UNRESOLVABLE above.
    }

    // 6. Channel mask. An unrecognized channel resolves to bit 0 and therefore blocks.
    const channel = String(context.channel ?? '').trim().toLowerCase();
    const channelBit = VOUCHER_CHANNEL_BITS[channel] || 0;
    if (!hasMaskBit(voucher.channels_mask, channelBit)) {
        addReason(REASON.VOUCHER_CHANNEL_NOT_ELIGIBLE, 'Voucher is not valid on this channel.', {
            channel: channel || null,
            channels_mask: Number(voucher.channels_mask)
        });
    }

    // 7-8. Storefront-only dimensions. POS has neither a fulfillment method nor an order timing, so
    // applying these masks there would block every POS redemption for a reason POS cannot satisfy.
    if (channel === 'storefront') {
        const fulfillmentMethod = String(context.fulfillmentMethod ?? '').trim().toLowerCase();
        const fulfillmentBit = VOUCHER_FULFILLMENT_BITS[fulfillmentMethod] || 0;
        if (!hasMaskBit(voucher.fulfillment_methods_mask, fulfillmentBit)) {
            addReason(
                REASON.VOUCHER_FULFILLMENT_NOT_ELIGIBLE,
                'Voucher is not valid for this fulfillment method.',
                {
                    fulfillment_method: fulfillmentMethod || null,
                    fulfillment_methods_mask: Number(voucher.fulfillment_methods_mask)
                }
            );
        }

        const orderTiming = String(context.orderTiming ?? '').trim().toLowerCase();
        const orderTimingBit = VOUCHER_ORDER_TIMING_BITS[orderTiming] || 0;
        if (!hasMaskBit(voucher.order_timings_mask, orderTimingBit)) {
            addReason(
                REASON.VOUCHER_ORDER_TIMING_NOT_ELIGIBLE,
                'Voucher is not valid for this order timing.',
                {
                    order_timing: orderTiming || null,
                    order_timings_mask: Number(voucher.order_timings_mask)
                }
            );
        }
    }

    // 9-10. Basket minimums. Both columns are legitimately nullable -- null means "no minimum" -- so
    // the "absent must be unrepresentable" rule that governs the four masks does not apply here.
    const subtotalCentavos = Number(context.subtotalCentavos ?? 0) || 0;
    const quantity = Number(context.quantity ?? 0) || 0;

    if (voucher.min_spend_centavos != null && subtotalCentavos < Number(voucher.min_spend_centavos)) {
        addReason(REASON.VOUCHER_MIN_SPEND_NOT_MET, 'Order subtotal is below the voucher minimum spend.', {
            min_spend_centavos: Number(voucher.min_spend_centavos),
            subtotal_centavos: subtotalCentavos
        });
    }
    if (voucher.min_quantity != null && quantity < Number(voucher.min_quantity)) {
        addReason(REASON.VOUCHER_MIN_QUANTITY_NOT_MET, 'Order quantity is below the voucher minimum quantity.', {
            min_quantity: Number(voucher.min_quantity),
            quantity
        });
    }

    // 11-13. Exhaustion previews only. Phase 105 enforces these atomically against the ledger.
    if (voucher.max_redemptions != null
        && Number(voucher.redeemed_count ?? 0) >= Number(voucher.max_redemptions)) {
        addReason(REASON.VOUCHER_REDEMPTION_LIMIT_REACHED, 'Voucher has reached its redemption limit.', {
            max_redemptions: Number(voucher.max_redemptions),
            redeemed_count: Number(voucher.redeemed_count ?? 0)
        });
    }
    if (voucher.max_total_discount_centavos != null
        && Number(voucher.redeemed_value_centavos ?? 0) >= Number(voucher.max_total_discount_centavos)) {
        addReason(REASON.VOUCHER_BUDGET_EXHAUSTED, 'Voucher has exhausted its total discount budget.', {
            max_total_discount_centavos: Number(voucher.max_total_discount_centavos),
            redeemed_value_centavos: Number(voucher.redeemed_value_centavos ?? 0)
        });
    }
    if (voucher.max_benefit_quantity != null
        && Number(voucher.redeemed_quantity ?? 0) >= Number(voucher.max_benefit_quantity)) {
        addReason(REASON.VOUCHER_QUANTITY_LIMIT_REACHED, 'Voucher has exhausted its benefit quantity limit.', {
            max_benefit_quantity: Number(voucher.max_benefit_quantity),
            redeemed_quantity: Number(voucher.redeemed_quantity ?? 0)
        });
    }

    return { eligible: reasons.length === 0, reasons };
};

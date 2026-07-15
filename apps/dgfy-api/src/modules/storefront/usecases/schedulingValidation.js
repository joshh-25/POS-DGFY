import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { STOREFRONT_MIN_LEAD_MINUTES, STOREFRONT_MAX_ADVANCE_DAYS } from '../../../config/env.js';

// schedulingValidation.js — Phase 10 Plan 06 Task 1 (STF-04, D-11..D-13).
//
// Pure, DB-free fulfillment/scheduling validator for storefront order
// placement. Independent of Phase 8's Booking capacity mechanism (D-11: no
// capacity check anywhere in this file) — this only validates that a
// `requested_for` timestamp is a sane future point in time: within the
// branch's declared business hours (D-12), at least
// STOREFRONT_MIN_LEAD_MINUTES ahead (D-12, [ASSUMED A1]), and at most
// STOREFRONT_MAX_ADVANCE_DAYS ahead (D-13, [ASSUMED A2]).
//
// Mirrors the legacy validateScheduledFor/assertCheckoutTimeWithinStorefront
// Hours throw-based convention (backend/src/modules/store/usecases/
// storeUseCases.js:556-585, backend/src/modules/shared/utils/
// storefrontBusinessHours.js — READ-ONLY reference, never imported: apps/
// dgfy-api never imports backend/ code). The weekly-schedule business-hours
// shape below is a fresh, self-contained reimplementation of that same
// shape (timezone + per-weekday enabled/intervals), not a port of the file
// itself.

const FULFILLMENT_MODES = ['pickup', 'delivery'];
const FULFILLMENT_TIMINGS = ['immediate', 'scheduled'];
const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME_24H_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const validationError = (message, reasonCode) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 422, details: { reason_code: reasonCode } }
);

/**
 * Resolves a Date's weekday index (0=sun..6=sat) and minutes-since-midnight
 * IN the given IANA timezone, defaulting to Asia/Manila (matches the legacy
 * DEFAULT_TIMEZONE). Falls back to server-local time if Intl throws (e.g. an
 * invalid timezone string) — never throws itself.
 * @param {Date} date
 * @param {string} [timezone]
 */
const getZonedParts = (date, timezone) => {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone || 'Asia/Manila',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
        const dayIndex = DAY_ORDER.indexOf(String(parts.weekday || '').toLowerCase().slice(0, 3));
        return {
            dayIndex: dayIndex === -1 ? date.getDay() : dayIndex,
            minutes: (Number.parseInt(parts.hour, 10) * 60) + Number.parseInt(parts.minute, 10)
        };
    } catch {
        return {
            dayIndex: date.getDay(),
            minutes: (date.getHours() * 60) + date.getMinutes()
        };
    }
};

const toMinutes = (hhmm) => {
    const match = String(hhmm || '').trim().match(TIME_24H_PATTERN);
    if (!match) return null;
    return (Number.parseInt(match[1], 10) * 60) + Number.parseInt(match[2], 10);
};

const isWithinWindow = ({ minutes, startMinutes, endMinutes }) => {
    if (startMinutes === endMinutes) return true; // 24-hour interval
    if (endMinutes > startMinutes) return minutes >= startMinutes && minutes <= endMinutes;
    return minutes >= startMinutes || minutes <= endMinutes; // overnight window (e.g. 22:00-02:00)
};

/**
 * Checks a Date against a weekly business-hours schedule:
 *   { timezone?: string, weekly: { sun: {enabled, intervals: [{open,close}]}, ... } }
 * No configured hours (null/undefined/missing `weekly`) means "always open"
 * (matches the legacy convention: `if (!normalized) return true`).
 * @param {Date} date
 * @param {{timezone?: string, weekly?: Object}|null} businessHours
 */
export const isWithinBusinessHours = (date, businessHours) => {
    if (!businessHours || !businessHours.weekly) return true;
    const { dayIndex, minutes } = getZonedParts(date, businessHours.timezone);
    const todayKey = DAY_ORDER[dayIndex];
    const yesterdayKey = DAY_ORDER[(dayIndex + 6) % 7];
    const today = businessHours.weekly[todayKey];
    const yesterday = businessHours.weekly[yesterdayKey];

    if (today?.enabled) {
        const matchedToday = (today.intervals || []).some((interval) => {
            const startMinutes = toMinutes(interval.open);
            const endMinutes = toMinutes(interval.close);
            if (startMinutes == null || endMinutes == null) return false;
            return isWithinWindow({ minutes, startMinutes, endMinutes });
        });
        if (matchedToday) return true;
    }

    // An overnight interval that started yesterday (e.g. 22:00-02:00) can
    // still cover "now" if now is before its close time.
    if (yesterday?.enabled) {
        const matchedYesterday = (yesterday.intervals || []).some((interval) => {
            const startMinutes = toMinutes(interval.open);
            const endMinutes = toMinutes(interval.close);
            return startMinutes != null && endMinutes != null && endMinutes < startMinutes && minutes <= endMinutes;
        });
        if (matchedYesterday) return true;
    }

    return false;
};

/**
 * Validates fulfillment mode/timing/scheduling for a storefront order
 * placement (STF-04).
 *
 * - `fulfillment_mode` must be 'pickup' | 'delivery'.
 * - `fulfillment_timing` must be 'immediate' | 'scheduled'.
 * - For 'immediate': no scheduling bounds apply, `requestedFor` normalizes
 *   to null (no capacity check anywhere, D-11).
 * - For 'scheduled': `requestedFor` must be a valid, strictly-future ISO
 *   date-time, at least `minLeadMinutes` ahead (D-12, default
 *   STOREFRONT_MIN_LEAD_MINUTES), at most `maxAdvanceDays` ahead (D-13,
 *   default STOREFRONT_MAX_ADVANCE_DAYS), and within `businessHours`
 *   (D-12) — no capacity check (D-11).
 *
 * Throws a typed DomainError naming which bound failed
 * (details.reason_code) rather than returning a boolean, mirroring the
 * legacy validateScheduledFor/assertCheckoutTimeWithinStorefrontHours
 * throw-based convention.
 *
 * @param {{
 *   fulfillmentMode: string,
 *   fulfillmentTiming: string,
 *   requestedFor?: string|Date|null,
 *   businessHours?: {timezone?: string, weekly?: Object}|null,
 *   now?: Date,
 *   minLeadMinutes?: number,
 *   maxAdvanceDays?: number
 * }} input
 * @returns {{requestedFor: Date|null}}
 */
export function validateFulfillment({
    fulfillmentMode,
    fulfillmentTiming,
    requestedFor,
    businessHours = null,
    now = new Date(),
    minLeadMinutes = STOREFRONT_MIN_LEAD_MINUTES,
    maxAdvanceDays = STOREFRONT_MAX_ADVANCE_DAYS
} = {}) {
    if (!FULFILLMENT_MODES.includes(fulfillmentMode)) {
        throw validationError(
            `fulfillment_mode must be one of: ${FULFILLMENT_MODES.join(', ')}.`,
            'INVALID_FULFILLMENT_MODE'
        );
    }
    if (!FULFILLMENT_TIMINGS.includes(fulfillmentTiming)) {
        throw validationError(
            `fulfillment_timing must be one of: ${FULFILLMENT_TIMINGS.join(', ')}.`,
            'INVALID_FULFILLMENT_TIMING'
        );
    }

    if (fulfillmentTiming === 'immediate') {
        return { requestedFor: null };
    }

    // fulfillmentTiming === 'scheduled' from here on.
    if (!requestedFor) {
        throw validationError('requested_for is required for scheduled fulfillment.', 'REQUESTED_FOR_REQUIRED');
    }

    const parsed = requestedFor instanceof Date ? requestedFor : new Date(requestedFor);
    if (!Number.isFinite(parsed.getTime())) {
        throw validationError('requested_for must be a valid ISO date-time.', 'INVALID_REQUESTED_FOR');
    }

    const nowMs = now.getTime();
    const requestedMs = parsed.getTime();

    if (requestedMs <= nowMs) {
        throw validationError('requested_for must be in the future.', 'REQUESTED_FOR_NOT_FUTURE');
    }

    const minLeadMs = Number(minLeadMinutes) * 60 * 1000;
    if (requestedMs - nowMs < minLeadMs) {
        throw validationError(
            `requested_for must be at least ${minLeadMinutes} minutes from now.`,
            'REQUESTED_FOR_BELOW_MIN_LEAD'
        );
    }

    const maxAdvanceMs = Number(maxAdvanceDays) * 24 * 60 * 60 * 1000;
    if (requestedMs - nowMs > maxAdvanceMs) {
        throw validationError(
            `requested_for must be within ${maxAdvanceDays} days from now.`,
            'REQUESTED_FOR_BEYOND_MAX_ADVANCE'
        );
    }

    if (!isWithinBusinessHours(parsed, businessHours)) {
        throw validationError('requested_for is outside business hours.', 'OUTSIDE_BUSINESS_HOURS');
    }

    return { requestedFor: parsed };
}

export default validateFulfillment;

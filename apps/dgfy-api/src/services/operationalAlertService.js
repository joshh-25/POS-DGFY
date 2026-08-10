/**
 * Operational Alert Service
 *
 * Raises a throttled operational alert for failures that happen outside the
 * request/response cycle -- most importantly, outbound email delivery
 * failures (issue #279). Nothing in apps/dgfy-api/src called Sentry.captureException
 * directly before this: Sentry only ever fired through sentryErrorHandler on
 * the Express error path, and every email failure was swallowed by its
 * caller (a local delivery-status field, a caught-and-logged error) before
 * it could ever reach that handler.
 *
 * Throttling is mandatory, not an optimization: without it, an SMTP outage
 * would raise one Sentry event per failed send and burn the project's event
 * quota inside minutes. Throttling is keyed per alert `key` via a short-TTL
 * distributed lock (cacheService.acquireLock), with an in-memory fallback so
 * a Redis outage doesn't turn a quiet failure into a noisy one.
 *
 * raiseOperationalAlert() never throws -- a failure to alert must never
 * cascade into breaking the caller's own error handling.
 */

import * as Sentry from '@sentry/node';
import logger from '../config/logger.js';
import { isSentryInitialized } from '../config/sentry.js';

const DEFAULT_THROTTLE_SECONDS = Number.parseInt(process.env.OPERATIONAL_ALERT_THROTTLE_SECONDS || '', 10) || 300;

// In-memory fallback throttle, used when cacheService is unavailable (Redis
// down, or the dynamic import below fails). Per-process, so it
// under-throttles across a multi-instance deployment rather than
// over-throttles -- an acceptable trade for "some alerts got through" over
// "an outage produced silence everywhere".
const lastAlertAtByKey = new Map();

// cacheService is loaded via a memoized dynamic import, not a static one:
// it imports dbStore.js, which default-imports the full models/index.js.
// This module is imported by emailService.js, which is in turn imported by
// ~30 other modules -- a static import here would drag the entire model
// layer into every one of their tests just to raise an alert (the same
// class of coupling emailService.js itself avoids for its delivery-log
// repository; see setEmailDeliveryLogRepository).
let _cacheServiceOverride = null;
let _cacheServicePromise = null;

/** Test seam: inject a fake cacheService instead of loading the real one. */
export const setCacheServiceForAlerts = (service) => {
  _cacheServiceOverride = service;
  _cacheServicePromise = null;
};

const getCacheService = async () => {
  if (_cacheServiceOverride) return _cacheServiceOverride;

  if (!_cacheServicePromise) {
    _cacheServicePromise = import('./cacheService.js')
      .then((mod) => mod.default)
      .catch((error) => {
        logger.error('[operationalAlertService] Failed to load cacheService', { error: error?.message });
        _cacheServicePromise = null;
        return null;
      });
  }

  return _cacheServicePromise;
};

const shouldAlert = async (key, throttleSeconds) => {
  const cacheService = await getCacheService();

  if (cacheService?.isAvailable?.()) {
    // acquireLock is a SET NX EX under the hood: the first caller within the
    // window gets `true`, everyone else gets `false` until it expires.
    return cacheService.acquireLock(`alert:${key}`, throttleSeconds);
  }

  const now = Date.now();
  const last = lastAlertAtByKey.get(key) || 0;
  if (now - last < throttleSeconds * 1000) return false;
  lastAlertAtByKey.set(key, now);
  return true;
};

/**
 * @param {Object} params
 * @param {string} params.key - Stable alert identifier, e.g. 'email.smtp_send_failed'. Used as the throttle bucket.
 * @param {'error'|'warning'} [params.level] - Severity; also selects logger.error vs logger.warn.
 * @param {string} [params.message] - Human-readable summary. Falls back to error.message.
 * @param {Error} [params.error] - The underlying error, if any.
 * @param {Object} [params.context] - Structured, PII-free context (e.g. recipient_domain, delivery_id, status_code).
 * @param {number} [params.throttleSeconds] - Override the default per-key throttle window.
 * @returns {Promise<void>} Never rejects.
 */
export const raiseOperationalAlert = async ({
  key,
  level = 'error',
  message,
  error = null,
  context = {},
  throttleSeconds = DEFAULT_THROTTLE_SECONDS
}) => {
  try {
    const summary = message || error?.message || key;
    const logPayload = { alert_key: key, ...context };

    if (level === 'warning') {
      logger.warn(summary, logPayload);
    } else {
      logger.error(summary, { ...logPayload, error: error?.message, stack: error?.stack });
    }

    const permitted = await shouldAlert(key, throttleSeconds).catch(() => true);
    if (!permitted) return;

    if (!isSentryInitialized()) return;

    Sentry.withScope((scope) => {
      scope.setLevel(level === 'warning' ? 'warning' : 'error');
      scope.setTag('alert_key', key);
      Object.entries(context).forEach(([contextKey, value]) => {
        scope.setExtra(contextKey, value);
      });

      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(summary);
      }
    });
  } catch (alertError) {
    // The alert pipeline itself must never throw into the caller.
    logger.error('[operationalAlertService] Failed to raise alert', {
      alert_key: key,
      error: alertError?.message
    });
  }
};

export default { raiseOperationalAlert };

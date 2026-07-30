/**
 * Deprecation guard for the original single-file menu import endpoints
 * (`POST /items/import/pdf/preview` and `/confirm`), superseded by the batch
 * job endpoints.
 *
 * Two jobs, in this order:
 *
 * 1. **Kill switch.** With `MENU_IMPORT_LEGACY_SINGLE_FILE_ENABLED=false` the
 *    endpoints answer 410 Gone naming their successor, so the legacy path can
 *    be retired per-environment without a code change or a deploy — and
 *    restored just as fast if the batch path turns out to have a problem.
 *    410 rather than 404: the resource existed and is intentionally gone,
 *    which is exactly what a client needs to distinguish from a typo or a
 *    feature that was never enabled.
 *
 * 2. **Announcement + usage signal.** While still enabled, every call carries
 *    RFC 8594 `Deprecation`/`Sunset` headers and a `Link` to the successor,
 *    and logs a warning carrying the tenant. That log is the point: removal
 *    should be driven by observed usage going to zero, not by a date someone
 *    picked. There is nothing else in this codebase that would tell us whether
 *    a tenant still depends on this path.
 */

import logger from '../config/logger.js';
import {
    isMenuImportLegacySingleFileEnabled,
    menuImportLegacySunsetHttpDate,
    menuImportLegacyRetiredMessage,
    MENU_IMPORT_LEGACY_SUCCESSOR_PATH
} from '../config/menuImportFeature.js';

export const markLegacyMenuImportDeprecated = (req, res, next) => {
    if (!isMenuImportLegacySingleFileEnabled()) {
        return res.status(410).json({
            success: false,
            message: menuImportLegacyRetiredMessage,
            error_code: 'MENU_IMPORT_LEGACY_RETIRED',
            successor: MENU_IMPORT_LEGACY_SUCCESSOR_PATH
        });
    }

    res.set('Deprecation', 'true');
    res.set('Link', `<${MENU_IMPORT_LEGACY_SUCCESSOR_PATH}>; rel="successor-version"`);
    const sunset = menuImportLegacySunsetHttpDate();
    if (sunset) res.set('Sunset', sunset);

    logger.warn('Deprecated single-file menu import endpoint used', {
        path: req.originalUrl || req.url,
        tenant_id: req.user?.tenant_id || null,
        user_id: req.user?.user_id || null,
        successor: MENU_IMPORT_LEGACY_SUCCESSOR_PATH
    });

    return next();
};

export default markLegacyMenuImportDeprecated;

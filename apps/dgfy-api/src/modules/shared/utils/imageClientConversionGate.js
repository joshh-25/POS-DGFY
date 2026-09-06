/**
 * Server-authoritative gate for the `image_client_conversion` rollout flag (epic #265, Phase 298).
 *
 * Two tenant-local `system_settings` keys drive this: `image_client_conversion`
 * ('off' | 'opt_in' | 'on') and `image_client_conversion_scopes` (a JSON array of scope tokens,
 * only consulted while the first key is 'opt_in'). Seeded by migration
 * `apps/dgfy-migration-runner/migrations/*-add-image-client-conversion-settings.cjs`, modeled on
 * `20260503000001-add-customer-access-mode-settings.cjs`.
 *
 * Fail-safe direction: a missing settings row (a tenant whose migration hasn't run yet, or any
 * unrecognized/malformed value) resolves to 'off' / disabled for every scope -- "we don't know"
 * and "we said no" behave identically, matching the client-side getter's own fail-safe default
 * (rolloutFlag.js).
 */
export const IMAGE_CLIENT_CONVERSION_KEY = 'image_client_conversion';
export const IMAGE_CLIENT_CONVERSION_SCOPES_KEY = 'image_client_conversion_scopes';

export const PLATFORM_CONTROLLED_IMAGE_CLIENT_CONVERSION_KEYS = Object.freeze([
    IMAGE_CLIENT_CONVERSION_KEY,
    IMAGE_CLIENT_CONVERSION_SCOPES_KEY
]);

export const isPlatformControlledImageClientConversionKey = (key) => (
    PLATFORM_CONTROLLED_IMAGE_CLIENT_CONVERSION_KEYS.includes(key)
);

// The four real client-wiring call sites this ladder gates. `*_bulk` are not wired by any client
// yet (#298d, deferred to a follow-up PR) but are valid scope tokens now so that follow-up PR is
// a config addition against an already-shipped gate, not a new gate mechanism.
export const IMAGE_CLIENT_CONVERSION_SCOPE = Object.freeze({
    POS_CATALOG_SINGLE: 'pos_catalog_single',
    STOREFRONT_CATALOG_SINGLE: 'storefront_catalog_single',
    POS_CATALOG_BULK: 'pos_catalog_bulk',
    STOREFRONT_CATALOG_BULK: 'storefront_catalog_bulk'
});

const VALID_MODES = new Set(['off', 'opt_in', 'on']);

const normalizeScopesValue = (rawScopes) => {
    if (Array.isArray(rawScopes)) {
        return rawScopes.filter((scope) => typeof scope === 'string');
    }
    if (typeof rawScopes === 'string') {
        try {
            const parsed = JSON.parse(rawScopes);
            return Array.isArray(parsed) ? parsed.filter((scope) => typeof scope === 'string') : [];
        } catch {
            return [];
        }
    }
    return [];
};

/**
 * Resolves whether client-derived variants (medium/thumbnail files, and the client manifest) may
 * be accepted for one specific upload scope. Returns the resolved `mode` and `scope` alongside
 * `enabled` so a caller can log both without a second settings read.
 *
 * `settingsRepository` is optional and tolerated as absent (existing use-case unit tests construct
 * `buildUploadPosCatalogImageUseCase`/`buildUploadStorefrontCatalogImageUseCase` without one) --
 * absence resolves the same as any other unreadable-settings case: closed.
 */
export const resolveImageClientConversionGate = async ({ scope, settingsRepository } = {}) => {
    if (!scope || typeof settingsRepository?.getSettingsByKeys !== 'function') {
        return { enabled: false, mode: 'off', scope: scope || null };
    }

    let settings;
    try {
        settings = await settingsRepository.getSettingsByKeys([
            IMAGE_CLIENT_CONVERSION_KEY,
            IMAGE_CLIENT_CONVERSION_SCOPES_KEY
        ]);
    } catch {
        return { enabled: false, mode: 'off', scope };
    }

    const rawMode = settings?.[IMAGE_CLIENT_CONVERSION_KEY]?.value;
    const mode = VALID_MODES.has(rawMode) ? rawMode : 'off';

    if (mode === 'on') return { enabled: true, mode, scope };
    if (mode === 'off') return { enabled: false, mode, scope };

    const scopes = normalizeScopesValue(settings?.[IMAGE_CLIENT_CONVERSION_SCOPES_KEY]?.value);
    return { enabled: scopes.includes(scope), mode, scope };
};

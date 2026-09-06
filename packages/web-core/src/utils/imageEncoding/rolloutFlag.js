/**
 * Server-authoritative `image_client_conversion` rollout flag (epic #265, Phase 298 --
 * replaces Phase 296's inert stub).
 *
 * The two tenant-local `system_settings` keys this reads --
 * `image_client_conversion` ('off' | 'opt_in' | 'on') and `image_client_conversion_scopes`
 * (a JSON array of scope tokens, only consulted while the first key is 'opt_in') -- arrive on the
 * bootstrap `GET /settings` response. This module never fetches them itself: a setter
 * (`setImageClientConversionFromSettings`) is called once that response resolves, from the same
 * identity-sync flow `identifySentryUser`/`setAnalyticsContext` are already populated from (see
 * `WorkflowModeContext.jsx`'s `refreshWorkflowMode`) -- populating a module-level cache is the
 * existing idiom for this, not something new.
 *
 * Fail-safe direction: until the setter has been called at least once (first paint, before
 * `/settings` resolves) -- or if the settings fetch itself failed -- every scope resolves to
 * disabled and the global getter returns 'off'. A tenant that has never written these keys at all
 * (a pre-Phase-298 tenant whose migration seed row nonetheless makes this the common case, or any
 * unexpected/malformed value) resolves the same way. The kill switch's whole point is that "we
 * don't know" and "we said no" behave identically.
 */
const state = {
  mode: 'off',
  scopes: new Set(),
};

const VALID_MODES = new Set(['off', 'opt_in', 'on']);

const normalizeScopes = (rawScopes) => {
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
 * Populates the module-level cache from a `GET /settings` response (the same object
 * `getAllSettings()` resolves to). Call this once per settings refresh -- on initial bootstrap,
 * and again on `auth:login` / a forced settings refresh -- so a platform admin flipping the flag
 * takes effect on the tenant's next session without a client deploy.
 *
 * Passing `null`/`undefined` (a failed or not-yet-attempted fetch) resets to the fail-safe
 * default, matching `WorkflowModeContext.jsx`'s own reset-to-default-on-error pattern.
 */
export function setImageClientConversionFromSettings(settingsResponse) {
  const rawMode = settingsResponse?.image_client_conversion?.value;
  state.mode = VALID_MODES.has(rawMode) ? rawMode : 'off';
  state.scopes = new Set(normalizeScopes(settingsResponse?.image_client_conversion_scopes?.value));
}

/**
 * Global, zero-argument, synchronous read -- unchanged contract from the Phase 296 stub. Returns
 * the raw tri-state ('off' | 'opt_in' | 'on'). `imageEncoding/index.js`'s `prepareImageVariants`
 * uses this alone as a global fail-fast check (`=== 'off'`); it has no scope of its own to check,
 * since both real call sites already scope-gate before ever invoking it.
 */
export const getImageClientConversionFlag = () => state.mode;

/**
 * Per-scope check for a specific client-wiring call site (`pos_catalog_single`,
 * `storefront_catalog_single`, and the two bulk tokens once #298d wires them). 'on' enables every
 * scope unconditionally; 'opt_in' enables only scopes named in `image_client_conversion_scopes`;
 * 'off' (including the fail-safe default) enables nothing.
 */
export function isImageClientConversionEnabledForScope(scope) {
  if (state.mode === 'on') return true;
  if (state.mode === 'opt_in') return state.scopes.has(scope);
  return false;
}

/** Test-only escape hatch -- production code never calls this. */
export function resetImageClientConversionForTests() {
  state.mode = 'off';
  state.scopes = new Set();
}

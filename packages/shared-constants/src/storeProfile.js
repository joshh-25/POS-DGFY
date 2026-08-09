import {
    normalizeWorkflowMode,
    normalizeEnabledCapabilities,
    normalizeDisabledCapabilities,
    resolveWorkflowModeFamily,
    resolveWorkflowTemplateMode,
    resolveEffectiveCapabilities
} from './workflowModes.js';
import { resolvePosWorkflow } from './posWorkflows.js';
import { resolveEffectiveItemTaxonomy } from './modeItemTaxonomy.js';
import { STOREFRONT_ORDER_METHODS } from './orderMethods.js';
import { resolvePosDefaultsAndTerminology } from './posDefaultsAndTerminology.js';

/**
 * Store Profile materialization (issue #178 Phase 11).
 *
 * buildStoreProfile derives a tenant's current effective selling
 * configuration from the same registries the runtime reads today
 * (WORKFLOW_MODE_CAPABILITIES + overlay, POS_WORKFLOW_CONFIGS,
 * MODE_ITEM_TAXONOMY, order-method vocabulary). The result is persisted to
 * the `ops_store_profile` tenant setting whenever mode or overlay changes.
 *
 * Real consumers now read this profile: frontend affordances read it
 * directly from the shadow-write (Phase 18, WorkflowModeContext.jsx), and
 * the fail-closed capability gate reads it through resolveStoreProfile.js
 * for tenants opted into ops_store_profile_read (Phase 19). The equivalence
 * harness (backend/tests/storeProfile.equivalence.contract.test.js)
 * continues to prove profile-driven config is byte-identical to
 * registry-driven config for every tenant that has not curated a
 * subtractive overlay.
 *
 * The builder is deterministic: same mode + overlay in, byte-identical JSON
 * out. No timestamps, no randomness — determinism is what makes the diff
 * meaningful.
 *
 * v2 (issue #178 Phase 11 amendment) adds `pos_defaults` and `terminology`,
 * materialized from `posDefaultsAndTerminology.js` — closing the last gap
 * against `BUSINESS_MODE_TEMPLATE_REGISTRY`
 * (`frontend/src/features/settings/businessModeTemplates.js`), so the
 * profile fully covers every live registry before Phase 12 reads it.
 *
 * v3 (issue #178 Phase 13) adds `provenance`, defaulted to null/false for
 * every mode-switch-derived profile. Only `applyTemplateProvenance` (below)
 * ever sets it to something else, and only at tenant provisioning time — see
 * that function's own doc comment for why this does not violate ADR 0056
 * clause 2 (provenance never dereferenced at runtime).
 *
 * v4 (issue #178 Phase 16) adds `source.disabled_capabilities` — the
 * subtractive counterpart to `enabled_capabilities`. Without it, a
 * non-canonical template whose module list removes something from its base
 * mode (e.g. fnb_counter_service dropping tableService/kitchenQueue/
 * restaurantServiceCharge) was inexpressible as a Profile: modules was
 * always base-mode-union-overlay, never able to shrink below the base mode.
 * See ADR 0056's amendment for why this strengthens, not weakens, clause 1
 * (locked modules stay unreachable by either overlay).
 *
 * v5 (issue #178 Phase 21) makes `pos_workflow` and `item_taxonomy` derive
 * from the *effective* module set (`modules`, below) instead of the base
 * mode alone. Before this, a fnb_counter_service store's Profile still
 * carried the full-service fnb POS workflow (tables, kitchen, dine_in
 * default) and could still surface fnb-family item taxonomy presets it had
 * subtracted - Phase 19's backend gate correctly 403'd those surfaces, but
 * the affordances that render the buttons leading to them did not know to
 * stay hidden. Every mode's own base capability list already contains or
 * omits these keys identically to before, so this is a no-op for every
 * tenant that has not curated a subtractive overlay - proven by the
 * equivalence harness catching only a profile_version bump across all 11
 * modes.
 */
export const STORE_PROFILE_SETTING_KEY = 'ops_store_profile';
export const STORE_PROFILE_VERSION = 5;

export const buildStoreProfile = ({ workflowMode, enabledCapabilities = [], disabledCapabilities = [] } = {}) => {
    const baseMode = normalizeWorkflowMode(workflowMode);
    const overlay = normalizeEnabledCapabilities(enabledCapabilities);
    const disabledOverlay = normalizeDisabledCapabilities(disabledCapabilities);
    const modules = [...resolveEffectiveCapabilities(baseMode, overlay, disabledOverlay)].sort();
    const posWorkflow = resolvePosWorkflow(baseMode, modules);
    const itemTaxonomy = resolveEffectiveItemTaxonomy(baseMode, modules);
    const { pos_defaults: posDefaults, terminology } = resolvePosDefaultsAndTerminology(baseMode);

    return {
        profile_version: STORE_PROFILE_VERSION,
        source: {
            base_mode: baseMode,
            family: resolveWorkflowModeFamily(baseMode),
            template_mode: resolveWorkflowTemplateMode(baseMode),
            enabled_capabilities: [...overlay].sort(),
            disabled_capabilities: [...disabledOverlay].sort()
        },
        modules,
        pos_workflow: {
            mode: posWorkflow.mode,
            transaction_record: posWorkflow.transactionRecord,
            allowed_methods: [...posWorkflow.allowedMethods],
            capabilities: { ...posWorkflow.capabilities }
        },
        pos_defaults: { ...posDefaults },
        storefront: {
            order_methods: [...STOREFRONT_ORDER_METHODS]
        },
        item_taxonomy: itemTaxonomy
            ? {
                mode: itemTaxonomy.mode,
                default_preset: itemTaxonomy.default_preset,
                preset_keys: itemTaxonomy.presets.map((preset) => preset.key)
            }
            : null,
        terminology: { ...terminology },
        provenance: {
            source_template_id: null,
            source_template_version: null,
            diverged_from_source: false
        }
    };
};

export const storeProfilesEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Stamps template provenance onto an already-built profile (issue #178
 * Phase 13). Called exactly once, at tenant provisioning, right after a
 * canonical published template was found for the tenant's chosen mode -
 * never again afterward, and never by any request-serving code path.
 *
 * This does NOT violate ADR 0056 clause 2 ("provenance is never
 * dereferenced at runtime"): the clause forbids using a template row to
 * DETERMINE a tenant's effective configuration on an ongoing basis. Stamping
 * an immutable record of where a profile originated, once, at the moment it
 * is first written, is provenance capture, not dereference - nothing ever
 * reads `source_template_id` back out to decide what a tenant's Profile
 * should contain. `diverged_from_source` is deliberately left `false` here
 * and is never recomputed by this codebase yet (issue #178 §9.3: captured
 * now, without building the review-and-accept flow that would maintain it).
 */
export const applyTemplateProvenance = (profile, { templateId, templateVersion } = {}) => ({
    ...profile,
    provenance: {
        source_template_id: templateId ?? null,
        source_template_version: templateVersion ?? null,
        diverged_from_source: false
    }
});

/**
 * Master-admin gated per-tenant setting that opts a tenant into the runtime
 * resolving `ops_store_profile` instead of rebuilding it on every read
 * (issue #178 Phase 12). Mirrors `ENABLED_CAPABILITIES_SETTING_KEY`'s
 * governance shape (single-source key here, master-admin write gate,
 * short-TTL cache) rather than inventing a second authorization model.
 *
 * Default off. Turning it on for a tenant curated with a non-canonical
 * template (Phases 13/16/17) now has a real effect — the resolver serves a
 * Profile that can genuinely diverge from the base-mode registries, since
 * the disabled_capabilities overlay (Phase 16) gives templates a real
 * subtractive channel, and requireWorkflowCapability (Phase 19) gates on
 * that resolution for every tenant with this flag on.
 */
export const STORE_PROFILE_READ_SETTING_KEY = 'ops_store_profile_read';

export const normalizeStoreProfileReadFlag = (value) => value === true || value === 'true';

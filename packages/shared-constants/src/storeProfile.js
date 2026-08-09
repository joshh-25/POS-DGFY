import {
    normalizeWorkflowMode,
    normalizeEnabledCapabilities,
    resolveWorkflowModeFamily,
    resolveWorkflowTemplateMode,
    resolveEffectiveCapabilities
} from './workflowModes.js';
import { resolvePosWorkflow } from './posWorkflows.js';
import { resolveEffectiveItemTaxonomy } from './modeItemTaxonomy.js';
import { STOREFRONT_ORDER_METHODS } from './orderMethods.js';
import { resolvePosDefaultsAndTerminology } from './posDefaultsAndTerminology.js';

/**
 * Store Profile materialization (issue #178 Phase 11) — SHADOW-WRITE ONLY.
 *
 * buildStoreProfile derives a tenant's current effective selling
 * configuration from the same registries the runtime reads today
 * (WORKFLOW_MODE_CAPABILITIES + overlay, POS_WORKFLOW_CONFIGS,
 * MODE_ITEM_TAXONOMY, order-method vocabulary). The result is persisted to
 * the `ops_store_profile` tenant setting whenever mode or overlay changes.
 *
 * NOTHING MAY READ THIS PROFILE AT RUNTIME YET. It is written and diffed so
 * the equivalence harness (backend/tests/storeProfile.equivalence.contract.
 * test.js) can prove profile-driven config is byte-identical to
 * registry-driven config before any consumer flips over (Phase 12, per
 * module, behind a per-tenant flag).
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
 */
export const STORE_PROFILE_SETTING_KEY = 'ops_store_profile';
export const STORE_PROFILE_VERSION = 2;

export const buildStoreProfile = ({ workflowMode, enabledCapabilities = [] } = {}) => {
    const baseMode = normalizeWorkflowMode(workflowMode);
    const overlay = normalizeEnabledCapabilities(enabledCapabilities);
    const posWorkflow = resolvePosWorkflow(baseMode);
    const itemTaxonomy = resolveEffectiveItemTaxonomy(baseMode, overlay);
    const { pos_defaults: posDefaults, terminology } = resolvePosDefaultsAndTerminology(baseMode);

    return {
        profile_version: STORE_PROFILE_VERSION,
        source: {
            base_mode: baseMode,
            family: resolveWorkflowModeFamily(baseMode),
            template_mode: resolveWorkflowTemplateMode(baseMode),
            enabled_capabilities: [...overlay].sort()
        },
        modules: [...resolveEffectiveCapabilities(baseMode, overlay)].sort(),
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
        terminology: { ...terminology }
    };
};

export const storeProfilesEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

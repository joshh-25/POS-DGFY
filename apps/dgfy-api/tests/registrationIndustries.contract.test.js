import {
    REGISTRATION_INDUSTRIES,
    REGISTRATION_INDUSTRY_KEYS,
    REGISTRATION_INDUSTRY_TEMPLATE_KEYS,
    REGISTRATION_EXCLUDED_TEMPLATE_KEYS,
    resolveRegistrationIndustry,
    describeRegistrationIndustry
} from '../src/modules/shared/constants/registrationIndustries.js';
import {
    STORE_TEMPLATE_PRESETS
} from '../src/modules/shared/constants/capabilityModules.js';
import {
    WORKFLOW_MODE_VALUES,
    WORKFLOW_MODE_ALIASES,
    WORKFLOW_MODE_ENGINE
} from '../src/modules/shared/constants/workflowModes.js';

// issue #178 "templates become the Operating Mode" follow-up, re-scoped by
// issue #316: REGISTRATION_INDUSTRIES is no longer the runtime catalog (see
// registration_industries, the DB table it now seeds - migration
// 20260812000002-seed-registration-industries.cjs) - it is the seed
// baseline and fail-open fallback. These pins protect that role: every
// property they assert (mode/template pairing, base_mode match, preset
// accounting, order) must hold of the seed data the platform ships with,
// independent of anything an admin does to the table afterward.
describe('registration industry seed-baseline integrity', () => {
    const offeredModes = WORKFLOW_MODE_VALUES.filter((mode) => !(mode in WORKFLOW_MODE_ALIASES));

    it('maps every industry to an offered, de-aliased workflow mode', () => {
        for (const key of REGISTRATION_INDUSTRY_KEYS) {
            const entry = REGISTRATION_INDUSTRIES[key];
            expect(offeredModes).toContain(entry.workflow_mode);
        }
    });

    it('covers every offered mode with at least one industry entry', () => {
        const coveredModes = new Set(REGISTRATION_INDUSTRY_KEYS.map((key) => REGISTRATION_INDUSTRIES[key].workflow_mode));
        for (const mode of offeredModes) {
            expect(coveredModes).toContain(mode);
        }
    });

    it('points every non-null template_key at a real preset whose base_mode matches the entry', () => {
        for (const key of REGISTRATION_INDUSTRY_KEYS) {
            const entry = REGISTRATION_INDUSTRIES[key];
            if (entry.template_key === null) continue;
            const preset = STORE_TEMPLATE_PRESETS[entry.template_key];
            expect(preset).toBeDefined();
            expect(preset.base_mode).toBe(entry.workflow_mode);
        }
    });

    it('accounts for every seeded preset as either registration-reachable or explicitly excluded', () => {
        const presetKeys = Object.keys(STORE_TEMPLATE_PRESETS).sort();
        const accountedFor = [...REGISTRATION_INDUSTRY_TEMPLATE_KEYS, ...REGISTRATION_EXCLUDED_TEMPLATE_KEYS].sort();
        expect(accountedFor).toEqual(presetKeys);
        // The two lists must not overlap - a key is reachable XOR excluded.
        const overlap = REGISTRATION_INDUSTRY_TEMPLATE_KEYS.filter((k) => REGISTRATION_EXCLUDED_TEMPLATE_KEYS.includes(k));
        expect(overlap).toEqual([]);
    });

    it('gives a null template_key to exactly the industries whose mode is engine-external', () => {
        for (const key of REGISTRATION_INDUSTRY_KEYS) {
            const entry = REGISTRATION_INDUSTRIES[key];
            const isExternal = WORKFLOW_MODE_ENGINE[entry.workflow_mode] === 'external';
            expect(entry.template_key === null).toBe(isExternal);
        }
    });

    it('orders industries with unique, contiguous 1-based order values', () => {
        const orders = REGISTRATION_INDUSTRY_KEYS.map((key) => REGISTRATION_INDUSTRIES[key].order).sort((a, b) => a - b);
        expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
    });

    it('resolveRegistrationIndustry returns null for an unknown key and tolerates surrounding whitespace', () => {
        expect(resolveRegistrationIndustry('not_a_real_industry')).toBeNull();
        expect(resolveRegistrationIndustry(null)).toBeNull();
        expect(resolveRegistrationIndustry('  micro_fnb  ')).toEqual(REGISTRATION_INDUSTRIES.micro_fnb);
        expect(resolveRegistrationIndustry('micro_fnb')).toEqual(REGISTRATION_INDUSTRIES.micro_fnb);
    });

    it('makes micro_fnb reachable with no new mode - the fnb_counter_service pairing', () => {
        // The concrete gap this catalog closes: Micro Food & Beverage (a
        // first-class industry in DGFY's own classification guide) existed
        // only as a template with no registration path.
        expect(REGISTRATION_INDUSTRIES.micro_fnb.workflow_mode).toBe('fnb');
        expect(REGISTRATION_INDUSTRIES.micro_fnb.template_key).toBe('fnb_counter_service');
        expect(REGISTRATION_INDUSTRIES.fnb.workflow_mode).toBe('fnb');
        expect(REGISTRATION_INDUSTRIES.fnb.template_key).toBe('fnb_full_service');
    });

    it('describeRegistrationIndustry joins the engine classification without drifting from WORKFLOW_MODE_ENGINE', () => {
        const described = describeRegistrationIndustry('healthcare');
        expect(described.engine).toBe('external');
        expect(described.engine_note).toBeNull();

        const transitional = describeRegistrationIndustry('food_manufacturing');
        expect(transitional.engine).toBe('transitional');
        expect(transitional.engine_note).toBe('Skupervisor');

        const native = describeRegistrationIndustry('retail');
        expect(native.engine).toBe('native');
        expect(native.engine_note).toBeNull();

        expect(describeRegistrationIndustry('bogus_key')).toBeNull();
    });
});

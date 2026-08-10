import {
    REGISTRATION_INDUSTRY_KEYS,
    describeRegistrationIndustry,
    withEngineClassification
} from '../../shared/constants/registrationIndustries.js';

/**
 * The public read behind GET /api/v1/registration/industries (issue #178
 * "templates become the Operating Mode" follow-up; made DB-driven by issue
 * #316). Reads the registration_industries catalog table first - the
 * REGISTRATION_INDUSTRIES constant is now the seed baseline that table was
 * populated from, and serves only as a fail-open fallback here. Then joins
 * the result against the live landlord template catalog so a signup
 * surface never advertises a template that isn't actually published.
 *
 * Degrades safely rather than blocking registration at every step: a
 * catalogRepository lookup that fails outright, or returns nothing (an
 * unmigrated/unseeded environment), falls back to the constant with every
 * entry reported `hidden: false`. A template that is missing or not
 * `published`, or a landlord-DB lookup that fails outright, both fall back
 * to `template_key: null` / `template_modules: []` for the affected
 * entries - identical to the mode-only provisioning path this whole
 * feature is additive on top of (resolveProvisioningTemplateSelection
 * already tolerates a null/failed template lookup the same way).
 *
 * The response never shortens the array. `hidden` is metadata for the
 * client to filter on, not an omission - the frontend's local-fallback
 * catalog carries no `hidden` field at all, so if entries disappeared here
 * instead, a fetch failure would silently un-hide everything.
 */
export const buildListRegistrationIndustriesUseCase = ({ repository, catalogRepository, logger }) => {
    return async () => {
        let industries;
        try {
            const rows = await catalogRepository.findAll();
            if (rows.length === 0) throw new Error('registration_industries table is empty');
            industries = rows.map((row) => ({
                key: row.industry_key,
                order: row.display_order,
                label: row.label,
                summary: row.summary,
                niches: row.niches,
                workflow_mode: row.workflow_mode,
                template_key: row.template_key,
                hidden: row.hidden === true,
                ...withEngineClassification(row)
            }));
        } catch (error) {
            logger?.warn?.('[RegistrationIndustries] catalog lookup failed; falling back to the seed-baseline constant', {
                error: error.message
            });
            industries = REGISTRATION_INDUSTRY_KEYS.map((key) => ({
                ...describeRegistrationIndustry(key),
                hidden: false
            }));
        }

        const templateKeys = [...new Set(industries.map((entry) => entry.template_key).filter(Boolean))];

        let publishedTemplatesByKey = new Map();
        if (templateKeys.length > 0) {
            try {
                const found = await Promise.all(templateKeys.map((key) => repository.findByKey(key)));
                publishedTemplatesByKey = new Map(
                    found
                        .filter((template) => template?.status === 'published')
                        .map((template) => [template.template_key, template])
                );
            } catch (error) {
                logger?.warn?.('[RegistrationIndustries] template catalog lookup failed; degrading to mode-only entries', {
                    error: error.message
                });
                publishedTemplatesByKey = new Map();
            }
        }

        return industries.map((entry) => {
            const template = entry.template_key ? publishedTemplatesByKey.get(entry.template_key) : null;
            return {
                ...entry,
                template_key: template ? entry.template_key : null,
                template_modules: template ? template.modules : []
            };
        });
    };
};

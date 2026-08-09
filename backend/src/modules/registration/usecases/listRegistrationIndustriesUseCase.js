import {
    REGISTRATION_INDUSTRY_KEYS,
    describeRegistrationIndustry
} from '../../shared/constants/registrationIndustries.js';

/**
 * The public read behind GET /api/v1/registration/industries (issue #178
 * "templates become the Operating Mode" follow-up). Joins the code-owned
 * REGISTRATION_INDUSTRIES catalog against the live landlord template
 * catalog so a signup surface never advertises a template that isn't
 * actually published.
 *
 * Degrades safely rather than blocking registration: a template that is
 * missing or not `published`, or a landlord-DB lookup that fails outright,
 * both fall back to `template_key: null` for the affected entries -
 * identical to the mode-only provisioning path this whole feature is
 * additive on top of (resolveProvisioningTemplateSelection already
 * tolerates a null/failed template lookup the same way).
 */
export const buildListRegistrationIndustriesUseCase = ({ repository, logger }) => {
    return async () => {
        const industries = REGISTRATION_INDUSTRY_KEYS.map((key) => describeRegistrationIndustry(key));
        const templateKeys = [...new Set(industries.map((entry) => entry.template_key).filter(Boolean))];

        let publishedKeys = new Set();
        if (templateKeys.length > 0) {
            try {
                const found = await Promise.all(templateKeys.map((key) => repository.findByKey(key)));
                publishedKeys = new Set(
                    found.filter((template) => template?.status === 'published').map((template) => template.template_key)
                );
            } catch (error) {
                logger?.warn?.('[RegistrationIndustries] template catalog lookup failed; degrading to mode-only entries', {
                    error: error.message
                });
                publishedKeys = new Set();
            }
        }

        return industries.map((entry) => ({
            ...entry,
            template_key: entry.template_key && publishedKeys.has(entry.template_key) ? entry.template_key : null
        }));
    };
};

/**
 * Normalizes the JSON-backed niches field at the registration module boundary.
 *
 * MariaDB exposes JSON columns through the Sequelize model as JSON text, while
 * MySQL and mocked repositories may provide an already-parsed array. The API
 * contract is always an array of non-empty strings, regardless of the driver
 * representation.
 */
export const normalizeRegistrationIndustryNiches = (value) => {
    let parsed = value;

    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            parsed = null;
        }
    }

    return Array.isArray(parsed)
        ? parsed.map((niche) => String(niche || '').trim()).filter(Boolean).slice(0, 24)
        : [];
};

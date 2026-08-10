const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const normalizeIntakeFormSchema = (value) => {
    if (value == null || value === '') return null;

    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            return null;
        }
    }

    if (Array.isArray(parsed)) {
        return { fields: parsed };
    }

    if (isPlainObject(parsed)) {
        if (Array.isArray(parsed.fields) || Array.isArray(parsed.questions)) {
            return parsed;
        }
        return { fields: [] };
    }

    return null;
};

export default normalizeIntakeFormSchema;

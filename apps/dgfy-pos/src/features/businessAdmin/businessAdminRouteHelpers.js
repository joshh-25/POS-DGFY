// Shared by the route guard and login page so return targets remain same-origin.
export const sanitizeInternalReturnPath = (path = '', {
    fallback = '/',
    blockedPattern = /^\/(?:login|register|reset-password)(?:[/?#]|$)/i
} = {}) => {
    const raw = String(path || '').trim();
    if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
    if (blockedPattern.test(raw)) return fallback;
    return raw;
};

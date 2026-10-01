const normalizeFlag = (value) => String(value ?? '').trim().toLowerCase();

// Temporary bridge while the dedicated Back Office surface is unavailable. The
// popup is enabled by default only in local Vite development; staging/production
// builds must opt in explicitly with VITE_POS_VOID_APPROVAL_POPUP_ENABLED=true.
export const isInlineVoidApprovalPopupEnabled = (env = import.meta.env) => {
    if (normalizeFlag(env?.VITE_APP_SURFACE) !== 'pos') return false;
    const configured = normalizeFlag(env?.VITE_POS_VOID_APPROVAL_POPUP_ENABLED);
    if (configured === 'true') return true;
    if (configured === 'false') return false;
    return env?.DEV === true;
};

export const POS_VOID_APPROVAL_REVIEW_PERMISSIONS = Object.freeze([
    'business_admin:access',
    'business_admin:branches:view_all',
    'business_admin:high_risk:approve'
]);

export const POS_RECEIPT_METADATA_PENDING_SETTING_KEY = 'pos_receipt_metadata_pending_changes';

export const PLATFORM_CONTROLLED_POS_SOFTWARE_KEYS = Object.freeze([
    'pos_software_name',
    'pos_software_version',
    'pos_software_serial_number'
]);

export const TENANT_REVIEWED_POS_RECEIPT_KEYS = Object.freeze([
    'pos_registered_name',
    'pos_business_name',
    'pos_business_style',
    'pos_taxpayer_type',
    'pos_tin_branch',
    'pos_address',
    'pos_ptu_number',
    'pos_min_number',
    'pos_accreditation_number',
    'pos_fiscal_buyer_details_required',
    'pos_receipt_footer_message'
]);

export const PLATFORM_POS_METADATA_KEYS = Object.freeze([
    ...PLATFORM_CONTROLLED_POS_SOFTWARE_KEYS,
    ...TENANT_REVIEWED_POS_RECEIPT_KEYS
]);

export const isPlatformControlledPosSoftwareKey = (key) => (
    PLATFORM_CONTROLLED_POS_SOFTWARE_KEYS.includes(key)
);

export const isTenantReviewedPosReceiptKey = (key) => (
    TENANT_REVIEWED_POS_RECEIPT_KEYS.includes(key)
);

export const buildPendingPosReceiptMetadata = ({
    requestedChanges = {},
    currentPending = null,
    actorUser = null
} = {}) => {
    const pendingChanges = currentPending?.status === 'pending_review'
        && currentPending?.changes
        && typeof currentPending.changes === 'object'
        ? currentPending.changes
        : {};

    return {
        status: 'pending_review',
        requested_at: new Date().toISOString(),
        requested_by: actorUser?.username || actorUser?.email || actorUser?.user_id || 'tenant_admin',
        changes: {
            ...pendingChanges,
            ...requestedChanges
        }
    };
};

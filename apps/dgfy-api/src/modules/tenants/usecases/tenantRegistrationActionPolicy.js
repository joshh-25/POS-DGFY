const PROVISIONING_RETRY_AFTER_MS = 10 * 60 * 1000;

const action = (name, label, helperText, allowed = false) => ({
    action: name,
    allowed,
    label,
    helper_text: helperText
});

/**
 * Describes the one registration action a Platform Admin may take for a
 * pending tenant. The endpoint remains the final authority; this descriptor
 * keeps the list UI from offering an action that the endpoint must reject.
 */
export const buildTenantRegistrationAction = (tenant, now = Date.now()) => {
    if (tenant?.status !== 'pending') return null;

    const application = tenant.registrationApplication;
    if (!application) {
        return action(
            'reconcile',
            'Registration requires reconciliation',
            'No pending public registration is available for approval.'
        );
    }

    if (application.review_status === 'pending' && application.provisioning_status === 'not_started') {
        return action('approve', 'Approve', 'Approve the pending public registration.', true);
    }

    if (application.review_status === 'approved' && application.provisioning_status === 'failed') {
        return action('retry', 'Retry setup', 'Retry the failed tenant setup.', true);
    }

    if (application.review_status === 'approved' && application.provisioning_status === 'in_progress') {
        const updatedAt = Date.parse(application.updatedAt || application.updated_at || '');
        const isStale = Number.isFinite(updatedAt) && now - updatedAt >= PROVISIONING_RETRY_AFTER_MS;
        if (isStale) {
            return action('retry', 'Retry setup', 'The previous setup attempt is stale and can be retried.', true);
        }
        return action('setting_up', 'Setup in progress', 'Company setup is already in progress.');
    }

    if (application.review_status === 'rejected') {
        return action('reconcile', 'Registration requires reconciliation', 'This registration was rejected and cannot be approved.');
    }

    return action('reconcile', 'Registration requires reconciliation', 'Registration state does not allow approval.');
};

export { PROVISIONING_RETRY_AFTER_MS };

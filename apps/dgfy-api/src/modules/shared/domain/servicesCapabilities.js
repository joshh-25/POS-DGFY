import { PERMISSIONS } from '../../../config/permissions.js';
import { isModeRbacGenericFallbackEnabled } from '../../../config/modeRbacFallback.js';
import { modeHasCapability } from '../constants/workflowModes.js';
import { resolveWorkflowCapabilitySettings } from '../utils/workflowCapabilitySettingsCache.js';
import { resolveStoreProfile } from '../../settings/usecases/resolveStoreProfile.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';

const SERVICES_WORKFLOW_CAPABILITY = 'services';

const hasPermissionWithFallback = (user, primary, fallback, fallbackEnabled) => (
    hasEffectivePermission(user, primary)
    || (fallbackEnabled && fallback ? hasEffectivePermission(user, fallback) : false)
);

/**
 * Project the same service route requirements used by routes/services.js into
 * a read-only response for the POS affordance layer. This is not an
 * authorization shortcut: every service request still runs its route guard.
 */
export const buildServicesCapabilities = ({
    user = {},
    workflowEnabled = true,
    fallbackEnabled = false
} = {}) => {
    const enabled = workflowEnabled === true;
    const permission = (primary, fallback = null) => enabled
        && hasPermissionWithFallback(user, primary, fallback, fallbackEnabled);

    const capabilities = {
        workflow_enabled: enabled,
        generic_fallback_enabled: Boolean(fallbackEnabled),
        viewDashboard: permission(PERMISSIONS.SERVICES.actions.VIEW_DASHBOARD, PERMISSIONS.REPORTS.actions.VIEW_REPORTS),
        viewCatalog: permission(PERMISSIONS.SERVICES.actions.VIEW_CATALOG, PERMISSIONS.INVENTORY.actions.VIEW_ITEMS),
        createCatalog: permission(PERMISSIONS.SERVICES.actions.MANAGE_CATALOG, PERMISSIONS.INVENTORY.actions.CREATE_ITEMS),
        editCatalog: permission(PERMISSIONS.SERVICES.actions.MANAGE_CATALOG, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS),
        viewResources: permission(PERMISSIONS.SERVICES.actions.VIEW_RESOURCES, PERMISSIONS.INVENTORY.actions.VIEW_ITEMS),
        manageResources: permission(PERMISSIONS.SERVICES.actions.MANAGE_RESOURCES, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS),
        viewBookings: permission(PERMISSIONS.SERVICES.actions.VIEW_BOOKINGS, PERMISSIONS.POS.actions.VIEW_POS),
        manageBookings: permission(PERMISSIONS.SERVICES.actions.MANAGE_BOOKINGS, PERMISSIONS.POS.actions.TRANSACT_POS),
        viewWaitlist: permission(PERMISSIONS.SERVICES.actions.VIEW_WAITLIST, PERMISSIONS.POS.actions.VIEW_POS),
        manageWaitlist: permission(PERMISSIONS.SERVICES.actions.MANAGE_WAITLIST, PERMISSIONS.POS.actions.TRANSACT_POS),
        viewClients: permission(PERMISSIONS.SERVICES.actions.VIEW_CLIENTS, PERMISSIONS.REPORTS.actions.VIEW_REPORTS),
        viewReminders: permission(PERMISSIONS.SERVICES.actions.VIEW_REMINDERS, PERMISSIONS.POS.actions.VIEW_POS),
        manageReminders: permission(PERMISSIONS.SERVICES.actions.MANAGE_REMINDERS, PERMISSIONS.POS.actions.TRANSACT_POS)
    };

    return Object.freeze({
        ...capabilities,
        canAccess: Object.entries(capabilities)
            .filter(([key]) => key !== 'workflow_enabled' && key !== 'generic_fallback_enabled')
            .some(([, value]) => value === true)
    });
};

export const resolveServicesWorkflowAccess = async () => {
    const settings = await resolveWorkflowCapabilitySettings();
    const workflowEnabled = settings.readFlagEnabled
        ? (await resolveStoreProfile()).profile.modules.includes(SERVICES_WORKFLOW_CAPABILITY)
        : modeHasCapability(
            settings.mode,
            SERVICES_WORKFLOW_CAPABILITY,
            settings.enabledCapabilities,
            settings.disabledCapabilities
        );

    return {
        workflowEnabled,
        mode: settings.mode,
        fallbackEnabled: isModeRbacGenericFallbackEnabled(),
        readFlagEnabled: settings.readFlagEnabled === true
    };
};

export const buildResolvedServicesCapabilities = async (user = {}) => {
    const workflow = await resolveServicesWorkflowAccess();
    return {
        ...buildServicesCapabilities({
            user,
            workflowEnabled: workflow.workflowEnabled,
            fallbackEnabled: workflow.fallbackEnabled
        }),
        workflow_mode: workflow.mode,
        workflow_resolution: workflow.readFlagEnabled ? 'store_profile' : 'workflow_mode'
    };
};

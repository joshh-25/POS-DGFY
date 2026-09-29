import { isWorkflowPageVisible } from '../settings/workflowMode.js';
import { BACKOFFICE_MANIFEST } from './businessAdminManifest.js';

// Business Admin section keys are not identical to the shared workflow-page
// names. Keep this translation at the shell boundary so sidebar visibility
// and direct-route protection use the same capability registry as the API.
export const BUSINESS_ADMIN_WORKFLOW_PAGE_BY_SECTION = Object.freeze(
    Object.fromEntries(Object.values(BACKOFFICE_MANIFEST)
        .filter((definition) => definition.visibility?.workflowPage)
        .map((definition) => [definition.id, definition.visibility.workflowPage]))
);

export const getBusinessAdminWorkflowPageName = (section) => (
    BUSINESS_ADMIN_WORKFLOW_PAGE_BY_SECTION[String(section || '').trim()] || null
);

export const isBusinessAdminWorkflowSectionVisible = (
    section,
    workflowMode,
    enabledCapabilities = [],
    disabledCapabilities = []
) => {
    const pageName = getBusinessAdminWorkflowPageName(section);
    if (!pageName) return true;
    return isWorkflowPageVisible(pageName, workflowMode, enabledCapabilities, disabledCapabilities);
};

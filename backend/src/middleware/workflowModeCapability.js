import {
    getWorkflowModeLabel,
    modeHasCapability
} from '../modules/shared/constants/workflowModes.js';
import { resolveWorkflowCapabilitySettings } from '../modules/shared/utils/workflowCapabilitySettingsCache.js';

export const requireWorkflowCapability = (capability, moduleLabel = 'This module') => async (req, res, next) => {
    try {
        const { mode, enabledCapabilities } = await resolveWorkflowCapabilitySettings();
        if (modeHasCapability(mode, capability, enabledCapabilities)) {
            req.workflowMode = mode;
            req.enabledCapabilities = enabledCapabilities;
            return next();
        }
        return res.status(403).json({
            success: false,
            data: null,
            message: `${moduleLabel} is not available in ${getWorkflowModeLabel(mode)} Mode.`,
            error_code: 'WORKFLOW_MODE_CAPABILITY_DENIED',
            errors: {
                capability,
                workflow_mode: mode,
                workflow_mode_label: getWorkflowModeLabel(mode)
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
};

export default requireWorkflowCapability;

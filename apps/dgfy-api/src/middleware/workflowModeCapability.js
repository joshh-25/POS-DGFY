import dbStore from '../utils/dbStore.js';
import {
    DEFAULT_WORKFLOW_MODE,
    getWorkflowModeLabel,
    modeHasCapability,
    normalizeWorkflowMode
} from '../modules/shared/constants/workflowModes.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

const parseSettingValue = (setting) => {
    if (!setting) return DEFAULT_WORKFLOW_MODE;
    const raw = setting.setting_value;
    if (setting.data_type === 'json' && typeof raw === 'string') {
        try {
            return normalizeWorkflowMode(JSON.parse(raw));
        } catch {
            return DEFAULT_WORKFLOW_MODE;
        }
    }
    return normalizeWorkflowMode(raw);
};

const readWorkflowMode = async () => {
    const SystemSetting = dbStore.get('SystemSetting');
    const setting = await SystemSetting.findOne({
        where: { setting_key: WORKFLOW_MODE_SETTING_KEY },
        attributes: ['setting_key', 'setting_value', 'data_type']
    });
    return parseSettingValue(setting);
};

export const requireWorkflowCapability = (capability, moduleLabel = 'This module') => async (req, res, next) => {
    try {
        const mode = await readWorkflowMode();
        if (modeHasCapability(mode, capability)) {
            req.workflowMode = mode;
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

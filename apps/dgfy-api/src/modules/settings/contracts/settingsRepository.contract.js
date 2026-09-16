export const SettingsRepositoryContract = Object.freeze([
    'getAllSettings',
    'getSettingByKey',
    'getSettingsByKeys',
    'getInvalidTerminalCashierAssignments',
    'updateSettings',
    'updateSettingByKey',
    'resetSettingsToDefault',
    'applyThresholdSettings'
]);

export const assertSettingsRepositoryContract = (repository) => {
    SettingsRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`SettingsRepository missing required method: ${method}`);
        }
    });
};

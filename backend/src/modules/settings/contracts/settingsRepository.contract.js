export const SettingsRepositoryContract = Object.freeze([
    'getAllSettings',
    'getSettingByKey',
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

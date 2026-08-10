export const buildApplyThresholdSettingsUseCase = ({ settingsRepository }) => {
    return async () => settingsRepository.applyThresholdSettings();
};

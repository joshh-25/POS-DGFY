import { useCallback, useState } from 'react';

export default function usePosOperationsAccessController({
  posForm, setPosForm, handlePosSave
}) {
  const [defaultsDirty, setDefaultsDirty] = useState(false);

  const updateAccessPin = useCallback((updater) => {
    setDefaultsDirty(true);
    setPosForm(updater);
  }, [setPosForm]);

  const resetAccessPinDraft = useCallback((settingsAccessPinEnabled = false) => {
    setPosForm((current) => ({
      ...current,
      settingsAccessPin: '',
      clearSettingsAccessPin: false,
      settingsAccessPinEnabled: settingsAccessPinEnabled === true
    }));
    setDefaultsDirty(false);
  }, [setPosForm]);

  const saveDefaults = useCallback(async (nextValues = null) => {
    const effectiveForm = nextValues
      ? { ...posForm, ...nextValues }
      : posForm;
    if (nextValues) setPosForm(effectiveForm);
    const saved = await handlePosSave(nextValues ? effectiveForm : undefined, { silent: true });
    if (saved === true) {
      setDefaultsDirty(false);
    }
    return saved;
  }, [handlePosSave, posForm, setPosForm]);

  return {
    defaultsDirty,
    updateAccessPin,
    saveDefaults,
    resetAccessPinDraft
  };
}

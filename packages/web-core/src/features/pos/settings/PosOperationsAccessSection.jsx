import PosCashierAttendanceSettingsCard from '../components/PosCashierAttendanceSettingsCard.jsx';
import PosOperationsDefaultsSection from './PosOperationsDefaultsSection.jsx';
import PosAccountPermissionsSection from './PosAccountPermissionsSection.jsx';
import usePosOperationsAccessController from './usePosOperationsAccessController.js';

export default function PosOperationsAccessSection({
  terminalUser, locked, canEditSettings, loading, savingTab, handlePosSave, posForm, setPosForm, locations, incomingOrders,
  queueLocationScopeId, onlineOrderSoundEnabled, setOnlineOrderSoundEnabled,
  discountApprovers, discountApproversLoading, loadDiscountApprovers,
  updateDiscountAuthorization, discountAuthorizationSavingUserId, setApprovalPinUser, setApprovalPin,
  dayCloseOperators, dayCloseOperatorsLoading, loadDayCloseOperators, updateDayCloseAccess,
  dayCloseAccessSavingUserId, setDayClosePinUser
}) {
  const {
    updateAccessPin,
    saveDefaults,
    resetAccessPinDraft
  } = usePosOperationsAccessController({
    posForm,
    setPosForm,
    handlePosSave
  });

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <PosOperationsDefaultsSection
        locked={locked}
        loading={loading}
        savingTab={savingTab}
        posForm={posForm}
        locations={locations}
        incomingOrders={incomingOrders}
        queueLocationScopeId={queueLocationScopeId}
        onlineOrderSoundEnabled={onlineOrderSoundEnabled}
        setOnlineOrderSoundEnabled={setOnlineOrderSoundEnabled}
        saveDefaults={saveDefaults}
      />

      <section aria-label="Attendance and breaks">
        <PosCashierAttendanceSettingsCard locked={locked} canEdit={canEditSettings} />
      </section>

      <PosAccountPermissionsSection
        terminalUser={terminalUser}
        locked={locked}
        loading={loading}
        posForm={posForm}
        updateAccessPin={updateAccessPin}
        saveAccessPin={saveDefaults}
        resetAccessPinDraft={resetAccessPinDraft}
        discountApprovers={discountApprovers}
        discountApproversLoading={discountApproversLoading}
        loadDiscountApprovers={loadDiscountApprovers}
        updateDiscountAuthorization={updateDiscountAuthorization}
        discountAuthorizationSavingUserId={discountAuthorizationSavingUserId}
        setApprovalPinUser={setApprovalPinUser}
        setApprovalPin={setApprovalPin}
        dayCloseOperators={dayCloseOperators}
        dayCloseOperatorsLoading={dayCloseOperatorsLoading}
        loadDayCloseOperators={loadDayCloseOperators}
        updateDayCloseAccess={updateDayCloseAccess}
        dayCloseAccessSavingUserId={dayCloseAccessSavingUserId}
        setDayClosePinUser={setDayClosePinUser}
      />

    </div>
  );
}

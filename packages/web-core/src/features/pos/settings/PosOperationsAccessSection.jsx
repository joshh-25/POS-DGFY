import { Suspense } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
const PosCashierAttendanceSettingsCard = lazyWithChunkRetry(() => import('../components/PosCashierAttendanceSettingsCard.jsx'));
import PosOperationsDefaultsSection from './PosOperationsDefaultsSection.jsx';
import PosAccountPermissionsSection from './PosAccountPermissionsSection.jsx';
import TerminalLocalControlsSection from './TerminalLocalControlsSection.jsx';
import usePosOperationsAccessController from './usePosOperationsAccessController.js';

export default function PosOperationsAccessSection({
  terminalUser, locked, canEditSettings, loading, savingTab, handlePosSave, posForm, setPosForm, locations, incomingOrders,
  queueLocationScopeId, onlineOrderSoundEnabled, setOnlineOrderSoundEnabled,
  onlineOrderSoundId = 'new_order', downloadedOrderAlertSoundIds = [], orderAlertSoundDownloadId = '',
  previewingOrderAlertSoundId = '',
  onSelectOrderAlertSound = () => {}, onDownloadOrderAlertSound = async () => false, onImportOrderAlertSound = async () => false, orderAlertSoundImporting = false, onPreviewOrderAlertSound = async () => false,
  incomingOrderPopupEnabled = true, setIncomingOrderPopupEnabled = () => {},
  customerDisplayEnabled = true, customerDisplayCanOpen = false, customerDisplayStatus = 'closed', customerDisplayStatusLabel = 'Not connected',
  onCustomerDisplayEnabledChange = () => {}, onOpenCustomerDisplay = () => null, onEndCustomerDisplay = () => {},
  discountApprovers, discountApproversLoading, loadDiscountApprovers,
  updateDiscountAuthorization, discountAuthorizationSavingUserId, setApprovalPinUser, setApprovalPin,
  dayCloseOperators, dayCloseOperatorsLoading, loadDayCloseOperators, updateDayCloseAccess,
  dayCloseAccessSavingUserId, setDayClosePinUser,
  showPosDefaultsEditor = true,
  showAttendanceEditor = true,
  showTeamAccessEditor = true,
  showTerminalOnlyControls = false,
  terminalIdOptions = [],
  activeTerminalId = '',
  registryEnforced = false,
  activeShiftId = null,
  hardwareDriverLabel = '',
  hardwareStatus = null,
  hardwareLoading = false,
  isPrinterAvailable = false,
  printersDetected = 0,
  onTestPrinter = async () => false,
  onSelectTerminal = async () => false
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
      {showTerminalOnlyControls ? (
        <TerminalLocalControlsSection
          queueLocationScopeId={queueLocationScopeId}
          locations={locations}
          onlineOrderSoundEnabled={onlineOrderSoundEnabled}
          setOnlineOrderSoundEnabled={setOnlineOrderSoundEnabled}
          onlineOrderSoundId={onlineOrderSoundId}
          downloadedOrderAlertSoundIds={downloadedOrderAlertSoundIds}
          orderAlertSoundDownloadId={orderAlertSoundDownloadId}
          previewingOrderAlertSoundId={previewingOrderAlertSoundId}
          onSelectOrderAlertSound={onSelectOrderAlertSound}
          onDownloadOrderAlertSound={onDownloadOrderAlertSound}
          onImportOrderAlertSound={onImportOrderAlertSound}
          orderAlertSoundImporting={orderAlertSoundImporting}
          onPreviewOrderAlertSound={onPreviewOrderAlertSound}
          incomingOrderPopupEnabled={incomingOrderPopupEnabled}
          setIncomingOrderPopupEnabled={setIncomingOrderPopupEnabled}
          locked={locked}
          loading={loading}
          terminalIdOptions={terminalIdOptions}
          activeTerminalId={activeTerminalId}
          registryEnforced={registryEnforced}
          activeShiftId={activeShiftId}
          hardwareDriverLabel={hardwareDriverLabel}
          hardwareStatus={hardwareStatus}
          hardwareLoading={hardwareLoading}
          isPrinterAvailable={isPrinterAvailable}
          printersDetected={printersDetected}
          onTestPrinter={onTestPrinter}
          onSelectTerminal={onSelectTerminal}
        />
      ) : null}

      {showPosDefaultsEditor ? (
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
          onlineOrderSoundId={onlineOrderSoundId}
          downloadedOrderAlertSoundIds={downloadedOrderAlertSoundIds}
          orderAlertSoundDownloadId={orderAlertSoundDownloadId}
          previewingOrderAlertSoundId={previewingOrderAlertSoundId}
          onSelectOrderAlertSound={onSelectOrderAlertSound}
          onDownloadOrderAlertSound={onDownloadOrderAlertSound}
          onImportOrderAlertSound={onImportOrderAlertSound}
          orderAlertSoundImporting={orderAlertSoundImporting}
          onPreviewOrderAlertSound={onPreviewOrderAlertSound}
          incomingOrderPopupEnabled={incomingOrderPopupEnabled}
          setIncomingOrderPopupEnabled={setIncomingOrderPopupEnabled}
          customerDisplayEnabled={customerDisplayEnabled}
          customerDisplayCanOpen={customerDisplayCanOpen}
          customerDisplayStatus={customerDisplayStatus}
          customerDisplayStatusLabel={customerDisplayStatusLabel}
          onCustomerDisplayEnabledChange={onCustomerDisplayEnabledChange}
          onOpenCustomerDisplay={onOpenCustomerDisplay}
          onEndCustomerDisplay={onEndCustomerDisplay}
          saveDefaults={saveDefaults}
        />
      ) : null}

      {showAttendanceEditor ? (
        <section aria-label="Attendance and breaks">
          <Suspense fallback={null}>
            <PosCashierAttendanceSettingsCard locked={locked} canEdit={canEditSettings} />
          </Suspense>
        </section>
      ) : null}

      {showTeamAccessEditor ? (
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
      ) : null}

    </div>
  );
}

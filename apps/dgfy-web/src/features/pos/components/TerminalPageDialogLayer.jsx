import React, { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import ShiftCloseSummaryPrintView from './ShiftCloseSummaryPrintView.jsx';
import ZReadingPrintView from './ZReadingPrintView.jsx';

const PosTenantSetupModal = lazyWithChunkRetry(() => import('./PosTenantSetupModal.jsx'));
const PosHardwareMessageModal = lazyWithChunkRetry(() => import('./PosHardwareMessageModal.jsx'));
const OnlineOrderDetailsModal = lazyWithChunkRetry(() => import('./OnlineOrderDetailsModal.jsx'));
const OnlineOrderReceiptModal = lazyWithChunkRetry(() => import('./OnlineOrderReceiptModal.jsx'));

export default function TerminalPageDialogLayer({ model }) {
  const {
    DEFAULT_CURRENCY,
    POS_TERMINAL_SETUP_STEPS,
    activeShiftId,
    activeTerminalRegistry,
    adminReauthContext,
    adminReauthForm,
    adminReauthUnlock,
    canAdminBypassShiftPrompt,
    canOpenShift,
    canSubmitOpenShift,
    cashCollectionOrder,
    cashCollectionSaving,
    cashReceivedInput,
    cashierResumeContext,
    cashierResumeForm,
    cashierResumeUnlock,
    cashierUnlockSession,
    closeShiftBlocker,
    closeShiftConfirmOpen,
    closedShiftReport,
    closedShiftReportAutoPrint,
    closedShiftReportOpen,
    confirmCloseDay,
    dayCloseReadinessState,
    dismissStockAlertSummary,
    getNextTenantSetupStep,
    getPreviousTenantSetupStep,
    handleAdminReauthSubmit,
    handleCashierResumeSubmit,
    handleCloseDay,
    handleCollectCash,
    handleCompleteLegacyLink,
    handleCompleteTenantSetup,
    handleConfirmCloseShift,
    handleHardwareMessageOpenChange,
    handleIncomingOrderModalOpenChange,
    handleIncomingOrderReceiptOpenChange,
    handleLock,
    handlePostShiftReturnToLogin,
    handlePrintIncomingOrder,
    handleRequestLegacyLinkOtp,
    handleSettingsAccessPinSubmit,
    handleShiftOpeningModalOpenChange,
    handleShiftOpeningModalSubmit,
    handleSkipShiftOpeningForAdmin,
    handleStartLegacyRegistration,
    handleTenantSetupDataChanged,
    handleTerminalUnlockSubmit,
    handleViewStockAlertItems,
    hardwareMessage,
    incomingOrderDetail,
    incomingOrderModalOpen,
    incomingOrderPrintLoading,
    incomingOrderReceiptOpen,
    incomingReceiptOpeningId,
    isOnline,
    legacyLinkState,
    locationNameLookup,
    locationsState,
    myDayClosePinForm,
    myDayClosePinOpen,
    myDayClosePinSaving,
    openShiftForm,
    openTenantSetupStep,
    postShiftHandoff,
    printClosedShiftSummary,
    printZReading,
    renderUnlockFailurePanel,
    resumeTenantSetupFlow,
    saveMyDayClosePin,
    setAdminReauthForm,
    setCashCollectionOrder,
    setCashReceivedInput,
    setCashierResumeForm,
    setCloseShiftConfirmOpen,
    setClosedShiftReport,
    setClosedShiftReportAutoPrint,
    setClosedShiftReportOpen,
    setLegacyDgfyLinkBannerDismissed,
    setLegacyLinkState,
    setMyDayClosePinForm,
    setMyDayClosePinOpen,
    setOpenShiftForm,
    setPendingSettingsViewMode,
    setSettingsAccessPinModalOpen,
    setSettingsAccessPinValue,
    setTenantSetupDismissedThisSession,
    setTenantSetupModalOpen,
    setTerminalUnlockForm,
    setTerminalUnlockModalOpen,
    setZReadingCloseConfirmOpen,
    setZReadingClosePin,
    setZReadingPrintAutoPrint,
    setZReadingPrintOpen,
    setZReadingPrintState,
    setZReadingReport,
    settingsAccessPinModalOpen,
    settingsAccessPinSubmitting,
    settingsAccessPinValue,
    setupFlowActive,
    setupFlowState,
    shiftActionLoading,
    shiftOpeningModalOpen,
    showLegacyDgfyLinkBanner,
    signedInShiftResume,
    stockAlertSummary,
    submitting,
    tenantSetupFinishing,
    tenantSetupModalOpen,
    tenantSetupStep,
    terminalIdOptions,
    terminalMeta,
    terminalRegistry,
    terminalUnlockForm,
    terminalUnlockModalOpen,
    terminalUnlockMode,
    terminalUnlockRequired,
    terminalUser,
    toast,
    zReadingCloseConfirmOpen,
    zReadingClosePin,
    zReadingPrintAutoPrint,
    zReadingPrintOpen,
    zReadingPrintState,
    zReadingReport
  } = model;

  return (
    <>
<Dialog open={Boolean(cashCollectionOrder)} onOpenChange={(open) => { if (!open && !cashCollectionSaving) setCashCollectionOrder(null); }}>
          <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-950">Collect Cash</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">Record payment before completing this order. Change is calculated by the POS.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold">Order total: PHP {Number(cashCollectionOrder?.total_amount || 0).toFixed(2)}</p>
                <p>Change: PHP {Math.max(0, Number(cashReceivedInput || 0) - Number(cashCollectionOrder?.total_amount || 0)).toFixed(2)}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cash-received">Amount received</Label>
                <Input id="cash-received" inputMode="decimal" type="number" min="0" step="0.01" value={cashReceivedInput} onChange={(event) => setCashReceivedInput(event.target.value)} disabled={cashCollectionSaving} />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setCashCollectionOrder(null)} disabled={cashCollectionSaving}>Cancel</Button>
              <Button type="button" onClick={handleCollectCash} disabled={cashCollectionSaving}>{cashCollectionSaving ? 'Collecting...' : 'Collect Cash'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={terminalUnlockModalOpen} onOpenChange={(open) => {
          if (submitting) return;
          if (open === false && (terminalUnlockRequired || terminalUnlockMode === 'relock' || cashierResumeUnlock || adminReauthUnlock)) {
            toast.message('Unlock the terminal to continue.');
            return;
          }
          setTerminalUnlockModalOpen(open);
        }}>
          <DialogContent className="max-w-md border border-slate-200 p-0 shadow-2xl">
            <form onSubmit={adminReauthUnlock ? handleAdminReauthSubmit : (cashierResumeUnlock ? handleCashierResumeSubmit : handleTerminalUnlockSubmit)}>
              <DialogHeader className="border-b border-slate-100 px-5 py-4">
                <DialogTitle className="text-lg font-extrabold text-[#0F172A]">
                  {adminReauthUnlock
                    ? 'Admin Unlock'
                    : cashierResumeUnlock || signedInShiftResume
                      ? 'Resume Shift'
                      : terminalUnlockMode === 'relock'
                        ? 'Unlock Terminal'
                        : 'Open Shift'}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600">
                  {adminReauthUnlock
                    ? 'Enter the admin credentials to unlock POS. Cashier and terminal credentials are not required.'
                    : cashierResumeUnlock
                      ? 'Enter the DGFY cashier credentials for the open shift. Terminal password is not required.'
                      : signedInShiftResume
                        ? 'Your active shift was found. Resume the same terminal, cart, totals, and cashier session.'
                      : terminalUnlockMode === 'relock'
                        ? 'Reauthenticate the current DGFY operator to resume this terminal.'
                        : cashierUnlockSession?.email
                          ? 'Choose the registered POS terminal and start the cashier shift from this logged-in device.'
                          : 'Choose the registered POS terminal, sign in the cashier, and start the shift from this logged-in device.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-5 py-5">
                {adminReauthUnlock ? (
                  <>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1A4E8D]">
                      Admin lock: {adminReauthContext?.identifier || 'Company admin'}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="admin-reauth-identifier" className="text-xs font-extrabold text-[#0F172A]">
                        Admin Email
                      </Label>
                      <Input
                        id="admin-reauth-identifier"
                        type="email"
                        value={adminReauthForm.identifier}
                        onChange={(event) => setAdminReauthForm((prev) => ({ ...prev, identifier: event.target.value }))}
                        placeholder="admin@company.com"
                        autoComplete="username"
                        disabled={submitting}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="admin-reauth-password" className="text-xs font-extrabold text-[#0F172A]">
                        Admin Password
                      </Label>
                      <Input
                        id="admin-reauth-password"
                        type="password"
                        value={adminReauthForm.password}
                        onChange={(event) => setAdminReauthForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="Enter admin password"
                        autoComplete="current-password"
                        disabled={submitting}
                        required
                      />
                      <p className="text-[11px] text-[#64748B]">
                        Only a company admin can unlock an admin-locked POS.
                      </p>
                    </div>
                  </>
                ) : cashierResumeUnlock ? (
                  <>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1A4E8D]">
                      Open shift: {cashierResumeContext?.cashierEmail || cashierResumeContext?.cashierUsername || 'Current cashier'}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cashier-resume-identifier" className="text-xs font-extrabold text-[#0F172A]">
                        Cashier DGFY Email
                      </Label>
                      <Input
                        id="cashier-resume-identifier"
                        type="text"
                        value={cashierResumeForm.identifier}
                        onChange={(event) => setCashierResumeForm((prev) => ({ ...prev, identifier: event.target.value }))}
                        placeholder="cashier@company.com"
                        autoComplete="username"
                        disabled={submitting}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cashier-resume-password" className="text-xs font-extrabold text-[#0F172A]">
                        DGFY Password
                      </Label>
                      <Input
                        id="cashier-resume-password"
                        type="password"
                        value={cashierResumeForm.password}
                        onChange={(event) => setCashierResumeForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="Enter cashier password"
                        autoComplete="current-password"
                        disabled={submitting}
                        required
                      />
                      <p className="text-[11px] text-[#64748B]">
                        Only the cashier who owns this open shift can continue it.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="terminal-unlock-terminal-id" className="text-xs font-extrabold text-[#0F172A]">
                        Terminal ID
                      </Label>
                      {activeTerminalRegistry.length > 0 ? (
                        <>
                          <select
                            id="terminal-unlock-terminal-id"
                            value={terminalUnlockForm.terminalId || ''}
                            onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, terminalId: event.target.value }))}
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                            disabled={submitting || signedInShiftResume}
                            required
                          >
                            <option value="">Select registered terminal</option>
                            {activeTerminalRegistry.map((entry) => (
                              <option key={entry.terminal_id} value={entry.terminal_id}>
                                {entry.label
                                  ? `${entry.label} (${entry.terminal_id})${locationNameLookup.get(Number(entry.location_id || 0)) ? ` - ${locationNameLookup.get(Number(entry.location_id || 0))}` : ''}`
                                  : `${entry.terminal_id}${locationNameLookup.get(Number(entry.location_id || 0)) ? ` - ${locationNameLookup.get(Number(entry.location_id || 0))}` : ''}`}
                              </option>
                            ))}
                          </select>
                          {activeTerminalRegistry.length > 1 ? (
                            <p className="text-[11px] font-medium text-[#64748B]">
                              {activeTerminalRegistry.length} registered terminals available. A location may have multiple counters; choose the counter you are operating.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Input
                            id="terminal-unlock-terminal-id"
                            value={terminalUnlockForm.terminalId || ''}
                            onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, terminalId: event.target.value }))}
                            placeholder="COUNTER-01"
                            list="terminal-unlock-terminal-options"
                            autoComplete="off"
                            className="h-11 rounded-lg border-slate-200 px-3 text-[13px] font-semibold uppercase tracking-wide text-[#0F172A]"
                            disabled={submitting || signedInShiftResume}
                            required
                          />
                          <datalist id="terminal-unlock-terminal-options">
                            {terminalIdOptions.map((terminalId) => (
                              <option key={terminalId} value={terminalId} />
                            ))}
                          </datalist>
                        </>
                      )}
                      <p className="text-[11px] text-[#64748B]">
                        Enter the registered terminal ID from POS Setup. Example: `COUNTER-01`.
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                      Authorized DGFY users can open shifts from any logged-in device when the selected terminal is active and assigned to their allowed location.
                    </div>
                  </>
                )}
                {!adminReauthUnlock && !cashierResumeUnlock && terminalUnlockMode === 'shift_start' ? (
                  <>
                    {cashierUnlockSession?.email ? (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1A4E8D]">
                        Cashier signed in: {cashierUnlockSession.email}
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="terminal-unlock-cashier-email" className="text-xs font-extrabold text-[#0F172A]">
                            Cashier Email
                          </Label>
                          <Input
                            id="terminal-unlock-cashier-email"
                            type="email"
                            value={terminalUnlockForm.cashierEmail}
                            onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, cashierEmail: event.target.value }))}
                            placeholder="cashier@store.com"
                            disabled={submitting}
                            required
                          />
                          <p className="text-[11px] text-[#64748B]">
                            The cashier account signed in here becomes the owner of shift, sales, and cash drawer records.
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="terminal-unlock-cashier-password" className="text-xs font-extrabold text-[#0F172A]">
                            Cashier Password
                          </Label>
                          <Input
                            id="terminal-unlock-cashier-password"
                            type="password"
                            value={terminalUnlockForm.cashierPassword}
                            onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, cashierPassword: event.target.value }))}
                            placeholder="Enter cashier password"
                            disabled={submitting}
                            required
                          />
                        </div>
                      </>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="terminal-unlock-opening-cash" className="text-xs font-extrabold text-[#0F172A]">
                        Opening Cash
                      </Label>
                      <Input
                        id="terminal-unlock-opening-cash"
                        type="number"
                        min="0"
                        step="0.01"
                        value={terminalUnlockForm.openingFloatAmount}
                        onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
                        placeholder="0.00"
                        disabled={submitting}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="terminal-unlock-opening-note" className="text-xs font-extrabold text-[#0F172A]">
                        Opening Note
                      </Label>
                      <Input
                        id="terminal-unlock-opening-note"
                        value={terminalUnlockForm.openingNote}
                        onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, openingNote: event.target.value }))}
                        placeholder="Optional"
                        disabled={submitting}
                      />
                    </div>
                  </>
                ) : null}
                {renderUnlockFailurePanel()}
              </div>
              <DialogFooter className="border-t border-slate-100 px-5 py-4">
                {((cashierUnlockSession?.email && !activeShiftId && terminalUnlockMode === 'shift_start') || cashierResumeUnlock) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cashierResumeUnlock ? () => handleLock({ forceLogin: true }) : handleLock}
                    disabled={submitting || shiftActionLoading.open}
                  >
                    Back to Login
                  </Button>
                )}
                {canAdminBypassShiftPrompt && !signedInShiftResume && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkipShiftOpeningForAdmin}
                    disabled={shiftActionLoading.open}
                  >
                    Skip for Admin
                  </Button>
                )}
                <Button
                  type="submit"
                  className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                  disabled={submitting}
                >
                  {submitting
                    ? (adminReauthUnlock
                      ? 'Checking admin...'
                      : cashierResumeUnlock || signedInShiftResume
                        ? 'Resuming shift...'
                        : 'Opening shift...')
                    : (adminReauthUnlock
                      ? 'Unlock as Admin'
                      : cashierResumeUnlock || signedInShiftResume
                        ? 'Resume Shift'
                        : terminalUnlockMode === 'relock'
                          ? 'Unlock POS'
                          : 'Open Shift')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={shiftOpeningModalOpen} onOpenChange={handleShiftOpeningModalOpenChange}>
          <DialogContent className="max-w-md border border-slate-200 p-0 shadow-2xl">
            <form onSubmit={handleShiftOpeningModalSubmit}>
              <DialogHeader className="border-b border-slate-100 px-5 py-4">
                <DialogTitle className="text-lg font-extrabold text-[#0F172A]">Open Shift</DialogTitle>
                <DialogDescription className="text-sm text-slate-600">
                  No open shift is active. Enter opening cash to start a new shift before using POS.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Shift Closed. Sales, payments, receipt printing, and transaction changes are blocked.
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shift-opening-cash-amount" className="text-xs font-extrabold text-[#0F172A]">
                    Opening Cash
                  </Label>
                  <Input
                    id="shift-opening-cash-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    autoFocus
                    value={openShiftForm.openingFloatAmount}
                    onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
                    placeholder="0.00"
                    disabled={shiftActionLoading.open}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shift-opening-note" className="text-xs font-extrabold text-[#0F172A]">
                    Opening Note
                  </Label>
                  <Input
                    id="shift-opening-note"
                    value={openShiftForm.openingNote}
                    onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingNote: event.target.value }))}
                    placeholder="Optional"
                    disabled={shiftActionLoading.open}
                  />
                </div>
                {renderUnlockFailurePanel()}
              </div>
              <DialogFooter className="border-t border-slate-100 px-5 py-4">
                {canAdminBypassShiftPrompt && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkipShiftOpeningForAdmin}
                    disabled={shiftActionLoading.open}
                  >
                    Skip for Admin
                  </Button>
                )}
                <Button
                  type="submit"
                  className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                  disabled={shiftActionLoading.open || !canOpenShift || !canSubmitOpenShift}
                >
                  {shiftActionLoading.open ? 'Opening...' : 'Open Shift'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {setupFlowActive && (
          <div className="fixed left-4 top-4 z-[72] max-w-[min(92vw,460px)] rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-950 shadow-lg shadow-blue-900/10">
            {tenantSetupStep === POS_TERMINAL_SETUP_STEPS.PROFILE
              ? 'Finish tenant onboarding in POS Settings first. The rest of POS remains limited until setup is complete.'
              : (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP
                ? 'Finish Storefront Setup next. Add the company icon and cover image to continue.'
                : `Finish POS Setup next. Missing: ${[
                  setupFlowState.posRequirements.terminalRegistryReady ? null : 'registered terminal with password and store',
                  setupFlowState.posRequirements.cashierReady ? null : 'provisioned cashier access'
                ].filter(Boolean).join(', ')
                }.`)}
          </div>
        )}
        {setupFlowActive && (
          <div className="fixed right-4 top-4 z-[70] max-w-[min(92vw,420px)] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg shadow-amber-900/10">
            <span>
              Tenant onboarding still needs to be finished before the full POS becomes available.
            </span>
            <button
              type="button"
              className="ml-1 font-extrabold underline underline-offset-2"
              onClick={() => resumeTenantSetupFlow()}
            >
              Continue onboarding.
            </button>
          </div>
        )}
        {showLegacyDgfyLinkBanner && (
          <div className="fixed left-4 top-4 z-[70] max-w-[min(92vw,460px)] rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 pr-10 text-xs text-amber-950 shadow-lg shadow-amber-900/10">
            <button
              type="button"
              aria-label="Dismiss DGFY account link reminder"
              onClick={() => setLegacyDgfyLinkBannerDismissed(true)}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border border-amber-300 bg-white text-sm font-extrabold leading-none text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 focus:ring-offset-amber-50"
            >
              x
            </button>
            <div className="font-extrabold">Create or link your DGFY account</div>
            <p className="mt-1 leading-5">
              Create or link your DGFY account to keep IMS/POS access after June 17, 2027.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRequestLegacyLinkOtp}
                disabled={legacyLinkState.loading}
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-extrabold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
              >
                {legacyLinkState.otpSent ? 'Resend code' : 'Send link code'}
              </button>
              <button
                type="button"
                onClick={handleStartLegacyRegistration}
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-extrabold text-amber-950 hover:bg-amber-100"
              >
                Create DGFY account
              </button>
            </div>
            {legacyLinkState.otpSent && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={legacyLinkState.code}
                  onChange={(event) => setLegacyLinkState((prev) => ({ ...prev, code: event.target.value }))}
                  placeholder="6-digit code"
                  className="h-8 w-32 rounded-md border border-amber-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-amber-500"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={handleCompleteLegacyLink}
                  disabled={legacyLinkState.loading}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  Link account
                </button>
              </div>
            )}
          </div>
        )}
        <PosTenantSetupModal
          open={tenantSetupModalOpen}
          finishing={tenantSetupFinishing}
          currentStep={tenantSetupStep}
          companyName={setupFlowState.profileRequirements.companyName}
          profileData={{
            username: terminalUser?.username || '',
            email: terminalUser?.email || '',
            phoneNumber: terminalUser?.phone_number || ''
          }}
          posRequirements={setupFlowState.posRequirements}
          storefrontRequirements={setupFlowState.storefrontRequirements}
          terminalRegistry={terminalRegistry}
          terminalLocations={locationsState.locations}
          onStepSelect={openTenantSetupStep}
          onBack={() => {
            const previousStep = getPreviousTenantSetupStep(tenantSetupStep);
            if (previousStep) {
              openTenantSetupStep(previousStep);
            }
          }}
          onContinue={async ({ storefrontSetupReady = setupFlowState.storefrontSetupReady } = {}) => {
            const nextStep = getNextTenantSetupStep(tenantSetupStep);
            if (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.PROFILE) {
              openTenantSetupStep(nextStep);
              return;
            }
            if (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP) {
              if (!storefrontSetupReady) {
                toast.error('Finish Storefront Setup before continuing to POS Setup.');
                openTenantSetupStep(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);
                return;
              }
              openTenantSetupStep(nextStep);
              return;
            }
            if (!setupFlowState.posSetupReady) {
              toast.error('Finish POS Setup before opening the full POS.');
              openTenantSetupStep(POS_TERMINAL_SETUP_STEPS.POS_SETUP);
              return;
            }
            await handleCompleteTenantSetup();
          }}
          onSkip={() => {
            setTenantSetupModalOpen(false);
            setTenantSetupDismissedThisSession(true);
            toast.message('Finish tenant onboarding in POS Settings to unlock the rest of the POS.');
          }}
          onSetupDataChanged={handleTenantSetupDataChanged}
        />
        {hardwareMessage && (
          <Suspense fallback={null}>
            <PosHardwareMessageModal
              open
              message={hardwareMessage}
              onOpenChange={handleHardwareMessageOpenChange}
            />
          </Suspense>
        )}
        <Dialog
          open={settingsAccessPinModalOpen}
          onOpenChange={(open) => {
            if (settingsAccessPinSubmitting) return;
            setSettingsAccessPinModalOpen(open);
            if (!open) {
              setSettingsAccessPinValue('');
              setPendingSettingsViewMode('');
            }
          }}
        >
          <DialogContent className="border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-md">
            <form onSubmit={handleSettingsAccessPinSubmit}>
              <DialogHeader className="border-b border-slate-100 px-5 py-4">
                <DialogTitle className="text-lg font-extrabold text-slate-950">Enter POS Access PIN</DialogTitle>
                <DialogDescription className="text-sm leading-6 text-slate-600">
                  Main branch admin protected Settings, Reports, and Items with a branch PIN. Enter it to continue for this session.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 px-5 py-5">
                <div className="grid gap-2">
                  <Label htmlFor="settings-access-pin" className="text-xs font-extrabold text-[#0F172A]">
                    POS Access PIN
                  </Label>
                  <Input
                    id="settings-access-pin"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-bwignore="true"
                    style={{ WebkitTextSecurity: 'disc' }}
                    value={settingsAccessPinValue}
                    onChange={(event) => setSettingsAccessPinValue(event.target.value)}
                    placeholder="Enter 4 to 12 digit PIN"
                    disabled={settingsAccessPinSubmitting}
                    required
                  />
                  <p className="text-[11px] text-[#64748B]">
                    This unlock only lasts until the terminal is locked or the session ends.
                  </p>
                </div>
              </div>
              <DialogFooter className="border-t border-slate-100 gap-2 px-5 py-4 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSettingsAccessPinModalOpen(false);
                    setSettingsAccessPinValue('');
                    setPendingSettingsViewMode('');
                  }}
                  disabled={settingsAccessPinSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#1A4E8D] font-bold text-white hover:bg-[#143F73]"
                  disabled={settingsAccessPinSubmitting}
                >
                  {settingsAccessPinSubmitting ? 'Verifying...' : 'Unlock POS Tools'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={closeShiftConfirmOpen} onOpenChange={setCloseShiftConfirmOpen}>
          <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-950">Close Shift</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">
                Are you sure you want to close this shift?
              </DialogDescription>
            </DialogHeader>
            {closeShiftBlocker ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-900" role="alert" data-testid="pos-close-shift-blocker">
                <p>Resolve the following before closing this shift:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {Number(closeShiftBlocker.claimedParkedSaleCount || 0) > 0 && (
                    <li>{Number(closeShiftBlocker.claimedParkedSaleCount)} claimed parked sale{Number(closeShiftBlocker.claimedParkedSaleCount) === 1 ? '' : 's'} are still in progress on the server. Finish or release each one before closing.</li>
                  )}
                  {Number(closeShiftBlocker.pendingParkedSaleCount || 0) > 0 && (
                    <li>{Number(closeShiftBlocker.pendingParkedSaleCount)} offline parked sale{Number(closeShiftBlocker.pendingParkedSaleCount) === 1 ? '' : 's'} waiting for Sync. Reconnect and sync before closing.</li>
                  )}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
                Confirm the cash count and note before closing. Offline or retryable failures will still be queued for replay.
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloseShiftConfirmOpen(false)}
                disabled={shiftActionLoading.close}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmCloseShift}
                disabled={shiftActionLoading.close}
                className="bg-[#1A4E8D] font-bold text-white hover:bg-[#143F73]"
              >
                {shiftActionLoading.close ? 'Closing...' : 'Close shift'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={stockAlertSummary.open}
          onOpenChange={(open) => {
            if (!open) dismissStockAlertSummary();
          }}
        >
          <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-950">Stock Alert</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">
                POS inventory needs attention before the next selling session.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {stockAlertSummary.outOfStock.length > 0 ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-sm font-extrabold text-rose-700">
                    {stockAlertSummary.outOfStock.length} item{stockAlertSummary.outOfStock.length === 1 ? '' : 's'} out of stock
                  </p>
                  <p className="mt-1 text-xs leading-5 text-rose-700">
                    {stockAlertSummary.outOfStock.slice(0, 4).join(', ')}
                    {stockAlertSummary.outOfStock.length > 4 ? ` and ${stockAlertSummary.outOfStock.length - 4} more.` : ''}
                  </p>
                </div>
              ) : null}
              {stockAlertSummary.almostOutOfStock.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-extrabold text-amber-800">
                    {stockAlertSummary.almostOutOfStock.length} item{stockAlertSummary.almostOutOfStock.length === 1 ? '' : 's'} almost out of stock
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    {stockAlertSummary.almostOutOfStock.slice(0, 4).join(', ')}
                    {stockAlertSummary.almostOutOfStock.length > 4 ? ` and ${stockAlertSummary.almostOutOfStock.length - 4} more.` : ''}
                  </p>
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={dismissStockAlertSummary}>
                Dismiss
              </Button>
              <Button
                type="button"
                onClick={handleViewStockAlertItems}
                className="bg-[#1A4E8D] font-bold text-white hover:bg-[#143F73]"
              >
                View Items
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {incomingOrderModalOpen && (
          <Suspense fallback={null}>
            <OnlineOrderDetailsModal
              open
              onOpenChange={handleIncomingOrderModalOpenChange}
              order={incomingOrderDetail}
              loading={incomingReceiptOpeningId !== null && !incomingOrderDetail}
            />
          </Suspense>
        )}
        {incomingOrderReceiptOpen && (
          <Suspense fallback={null}>
            <OnlineOrderReceiptModal
              open
              onOpenChange={handleIncomingOrderReceiptOpenChange}
              order={incomingOrderDetail}
              loading={incomingReceiptOpeningId !== null && !incomingOrderDetail}
              onPrint={handlePrintIncomingOrder}
              printLoading={incomingOrderPrintLoading}
            />
            </Suspense>
        )}
        {closedShiftReportOpen && closedShiftReport && (
          <ShiftCloseSummaryPrintView
            report={closedShiftReport}
            currency={terminalMeta.pettyCashSymbol || DEFAULT_CURRENCY}
            businessSettings={terminalMeta.businessSettings}
            autoPrint={closedShiftReportAutoPrint}
            title={closedShiftReportAutoPrint ? 'Cashier Shift Sales Summary' : 'Current Shift Sales Summary'}
            onPrint={() => printClosedShiftSummary(closedShiftReport, {
              reason: closedShiftReportAutoPrint ? 'shift_summary_reprint' : 'shift_summary_manual_print'
            })}
            onClose={() => {
              setClosedShiftReportOpen(false);
              setClosedShiftReport(null);
              setClosedShiftReportAutoPrint(false);
            }}
          />
        )}
        <Dialog open={Boolean(postShiftHandoff)} onOpenChange={(open) => {
          if (!open && !shiftActionLoading.zReading) {
            void handlePostShiftReturnToLogin();
          }
        }}>
          <DialogContent className="max-w-lg border border-slate-200 p-0 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 px-5 py-4">
              <DialogTitle className="text-lg font-extrabold text-[#0F172A]">
                {postShiftHandoff?.source === 'shift_close' ? 'Shift Closed Successfully' : 'Day Close / Z-reading'}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">
                Selling is locked until a new cashier shift is opened. Review the branch status before leaving this terminal.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 px-5 py-5">
              {postShiftHandoff?.closeResult ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Your cashier shift is closed and its sales summary is saved. This does not close the branch business day.
                </div>
              ) : (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Day Close was opened without starting a cashier shift or unlocking checkout.
                </div>
              )}

              {postShiftHandoff?.loading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600" role="status">
                  Checking all cashier shifts in this branch...
                </div>
              ) : null}

              {postShiftHandoff?.errorMessage ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
                  {postShiftHandoff.errorMessage}
                </div>
              ) : null}

              {postShiftHandoff?.readiness?.authorized === false ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Your shift is closed, but this account cannot generate a Z-reading. An authorized cashier or manager can use Day Close from the terminal login screen.
                </div>
              ) : null}

              {postShiftHandoff?.readiness?.authorized !== false && postShiftHandoff?.readiness?.ready ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {postShiftHandoff.readiness.already_closed
                    ? `The Z-reading is already generated${postShiftHandoff.readiness.reading_identifier ? ` (${postShiftHandoff.readiness.reading_identifier})` : ''}. You may print it again.`
                    : 'All cashier shifts are closed. The branch Z-reading is ready to generate.'}
                </div>
              ) : null}

              {postShiftHandoff?.readiness?.authorized !== false && postShiftHandoff?.readiness && !postShiftHandoff.readiness.ready ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-extrabold">
                    Z-reading unavailable: {Number(postShiftHandoff.readiness.open_shift_count || 0)} cashier shift{Number(postShiftHandoff.readiness.open_shift_count || 0) === 1 ? '' : 's'} still open.
                  </p>
                  {Array.isArray(postShiftHandoff.readiness.open_shifts) && postShiftHandoff.readiness.open_shifts.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {postShiftHandoff.readiness.open_shifts.map((shift) => (
                        <li key={shift.shift_id || `${shift.terminal_id}-${shift.cashier_name}`}>
                          {shift.terminal_id || 'Unknown terminal'} — {shift.cashier_name || 'Unknown cashier'}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
            <DialogFooter className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4 sm:justify-end">
              {postShiftHandoff?.closeResult ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => printClosedShiftSummary(postShiftHandoff.closeResult, { reason: 'post_shift_summary_reprint' })}
                  disabled={shiftActionLoading.zReading}
                >
                  Print Shift Summary
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={handlePostShiftReturnToLogin} disabled={shiftActionLoading.zReading}>
                Return to Login
              </Button>
              {postShiftHandoff?.readiness?.authorized !== false ? (
                <Button
                  type="button"
                  onClick={handleCloseDay}
                  disabled={
                    postShiftHandoff?.loading
                    || shiftActionLoading.zReading
                    || !postShiftHandoff?.readiness?.ready
                    || !isOnline
                  }
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {postShiftHandoff?.readiness?.already_closed ? 'Reprint Z-reading' : 'Generate Z-reading'}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {zReadingPrintOpen && zReadingReport && (
          <ZReadingPrintView
            report={zReadingReport}
            currency={terminalMeta.pettyCashSymbol || DEFAULT_CURRENCY}
            businessSettings={terminalMeta.businessSettings}
            autoPrint={zReadingPrintAutoPrint}
            printState={zReadingPrintState}
            onPrint={() => printZReading(zReadingReport, {
              reason: zReadingReport.snapshot_reused ? 'z_reading_reprint' : 'z_reading_close_day'
            })}
            onClose={() => {
              setZReadingPrintOpen(false);
              setZReadingReport(null);
              setZReadingPrintAutoPrint(false);
              setZReadingPrintState('idle');
              if (postShiftHandoff) {
                void handlePostShiftReturnToLogin();
              }
            }}
          />
        )}
        <Dialog open={zReadingCloseConfirmOpen} onOpenChange={(open) => {
          if (shiftActionLoading.zReading) return;
          setZReadingCloseConfirmOpen(open);
          if (!open) setZReadingClosePin('');
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Day Close</DialogTitle>
              <DialogDescription>
                This will generate the branch Z-reading after every cashier shift is closed. Enter your own Day Close PIN to record accountability.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                The Z-reading is branch-wide and includes financially recognized sales from all cashiers and completed online orders.
              </div>
              {dayCloseReadinessState.loading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600" role="status">
                  Rechecking every cashier shift before Day Close...
                </div>
              ) : null}
              {dayCloseReadinessState.errorMessage ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
                  {dayCloseReadinessState.errorMessage}
                </div>
              ) : null}
              {dayCloseReadinessState.readiness && !dayCloseReadinessState.readiness.ready ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                  Close every cashier shift in this branch before generating the Z-reading.
                </div>
              ) : null}
              <div>
                <Label htmlFor="z-reading-day-close-pin">Your POS Day Close PIN</Label>
                <Input
                  id="z-reading-day-close-pin"
                  value={zReadingClosePin}
                  onChange={(event) => setZReadingClosePin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  style={{ WebkitTextSecurity: 'disc' }}
                  placeholder="4 to 12 digits"
                  className="mt-1"
                  disabled={shiftActionLoading.zReading || dayCloseReadinessState.loading || dayCloseReadinessState.readiness?.ready !== true}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setZReadingCloseConfirmOpen(false)} disabled={shiftActionLoading.zReading}>
                Cancel
              </Button>
              <Button
                type="button"
                data-testid="pos-close-day-confirm"
                onClick={confirmCloseDay}
                disabled={
                  shiftActionLoading.zReading
                  || dayCloseReadinessState.loading
                  || dayCloseReadinessState.readiness?.ready !== true
                  || !/^\d{4,12}$/.test(zReadingClosePin)
                }
              >
                {shiftActionLoading.zReading ? 'Closing Day...' : 'Confirm & Print Z-reading'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={myDayClosePinOpen} onOpenChange={(open) => {
          if (myDayClosePinSaving) return;
          setMyDayClosePinOpen(open);
          if (!open) setMyDayClosePinForm({ currentPassword: '', pin: '', confirmation: '' });
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>My POS Day Close PIN</DialogTitle>
              <DialogDescription>
                This personal PIN is used only to confirm a Z-reading for the current company. Your Master Admin can see its status but cannot view the PIN.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="my-day-close-current-password">Current account password</Label>
                <Input id="my-day-close-current-password" value={myDayClosePinForm.currentPassword} onChange={(event) => setMyDayClosePinForm((current) => ({ ...current, currentPassword: event.target.value }))} type="password" autoComplete="current-password" className="mt-1" disabled={myDayClosePinSaving} />
              </div>
              <div>
                <Label htmlFor="my-day-close-pin">New Day Close PIN</Label>
                <Input id="my-day-close-pin" value={myDayClosePinForm.pin} onChange={(event) => setMyDayClosePinForm((current) => ({ ...current, pin: event.target.value.replace(/\D/g, '').slice(0, 12) }))} type="text" inputMode="numeric" autoComplete="one-time-code" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" style={{ WebkitTextSecurity: 'disc' }} placeholder="4 to 12 digits" className="mt-1" disabled={myDayClosePinSaving} />
              </div>
              <div>
                <Label htmlFor="my-day-close-pin-confirmation">Confirm new Day Close PIN</Label>
                <Input id="my-day-close-pin-confirmation" value={myDayClosePinForm.confirmation} onChange={(event) => setMyDayClosePinForm((current) => ({ ...current, confirmation: event.target.value.replace(/\D/g, '').slice(0, 12) }))} type="text" inputMode="numeric" autoComplete="one-time-code" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" style={{ WebkitTextSecurity: 'disc' }} placeholder="Re-enter PIN" className="mt-1" disabled={myDayClosePinSaving} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMyDayClosePinOpen(false)} disabled={myDayClosePinSaving}>Cancel</Button>
              <Button type="button" onClick={saveMyDayClosePin} disabled={myDayClosePinSaving}>{myDayClosePinSaving ? 'Saving...' : 'Save PIN'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  );
}

import {
  Button
} from '@/components/ui/button';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { resolveUserPermissionList } from '../utils/terminalWorkspaceUtils.js';
import PosPinSetupRow from './PosPinSetupRow.jsx';
import PosSettingsAccessPinModal from './PosSettingsAccessPinModal.jsx';

export default function PosAccountPermissionsSection({
  terminalUser, locked, loading, posForm,
  updateAccessPin,
  saveAccessPin,
  resetAccessPinDraft,
  discountApprovers, discountApproversLoading, loadDiscountApprovers,
  updateDiscountAuthorization, discountAuthorizationSavingUserId, setApprovalPinUser, setApprovalPin,
  dayCloseOperators, dayCloseOperatorsLoading, loadDayCloseOperators, updateDayCloseAccess,
  dayCloseAccessSavingUserId, setDayClosePinUser
}) {
  const [settingsPinDialogOpen, setSettingsPinDialogOpen] = useState(false);
  const [settingsPinInitialEnabled, setSettingsPinInitialEnabled] = useState(false);
  const [settingsPinSaving, setSettingsPinSaving] = useState(false);
  const nonCashierDiscountApprovers = (Array.isArray(discountApprovers) ? discountApprovers : [])
    .filter((user) => String(user?.role || '').trim().toLowerCase() !== 'cashier');
  const builtInDiscountApprovers = nonCashierDiscountApprovers
    .filter((user) => user?.is_master_admin === true || ['admin', 'manager'].includes(String(user?.role || '').trim().toLowerCase()));
  const nonCashierDayCloseOperators = (Array.isArray(dayCloseOperators) ? dayCloseOperators : [])
    .filter((user) => String(user?.role || '').trim().toLowerCase() !== 'cashier');

  const openSettingsPinDialog = () => {
    setSettingsPinInitialEnabled(posForm.settingsAccessPinEnabled === true);
    setSettingsPinDialogOpen(true);
  };

  const closeSettingsPinDialog = (open) => {
    if (open || settingsPinSaving) return;
    resetAccessPinDraft(settingsPinInitialEnabled);
    setSettingsPinDialogOpen(false);
  };

  const saveSettingsPin = async () => {
    const settingsAccessPin = String(posForm.settingsAccessPin || '').trim();
    if (!/^\d{4,12}$/.test(settingsAccessPin)) {
      toast.error('Settings Access PIN must contain 4 to 12 digits.');
      return;
    }
    setSettingsPinSaving(true);
    try {
      const saved = await saveAccessPin({
        settingsAccessPin,
        clearSettingsAccessPin: false,
        settingsAccessPinEnabled: true
      });
      if (saved === true) setSettingsPinDialogOpen(false);
    } finally {
      setSettingsPinSaving(false);
    }
  };

  const clearSettingsPin = async () => {
    setSettingsPinSaving(true);
    try {
      const saved = await saveAccessPin({
        settingsAccessPin: '',
        clearSettingsAccessPin: true,
        settingsAccessPinEnabled: false
      });
      if (saved === true) setSettingsPinDialogOpen(false);
    } finally {
      setSettingsPinSaving(false);
    }
  };

  return (      <section aria-labelledby="pos-operations-access-title">
      <div className="space-y-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id="pos-operations-access-title" className="text-[16px] font-extrabold text-[#0F172A]">Access &amp; permissions</h3>
            <p className="mt-1 text-[12px] font-medium leading-5 text-[#64748B]">
              Admin PINs and POS access; cashier permissions are managed by terminal.
            </p>
          </div>
        </div>
            {terminalUser?.is_master_admin === true ? (
              <div className="mt-4 grid gap-3">
                <PosPinSetupRow
                  title="Settings Access PIN"
                  description="Protect sensitive POS settings."
                  status={posForm.settingsAccessPinEnabled ? 'Set' : 'PIN Not Set'}
                  statusClassName={posForm.settingsAccessPinEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-700'}
                  rowClassName="border-blue-200 bg-blue-50/50"
                  actionLabel={posForm.settingsAccessPinEnabled ? 'Change PIN' : 'Set PIN'}
                  onAction={openSettingsPinDialog}
                  disabled={locked || loading}
                />
                {builtInDiscountApprovers.map((user) => {
                  const isSavingAuthorization = Number(discountAuthorizationSavingUserId) === Number(user?.user_id);
                  return (
                    <PosPinSetupRow
                      key={`discount-approver-${user.user_id}`}
                      title="POS Discount Authorization PIN"
                      description={`${user.username || user.email} · ${user.role || 'Admin'} · POS discounts.`}
                      status={user.pos_approval_pin_configured ? 'Set' : 'PIN Not Set'}
                      statusClassName={user.pos_approval_pin_configured ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-700'}
                      rowClassName="border-emerald-200 bg-emerald-50/60"
                      actionLabel={user.pos_approval_pin_configured ? 'Reset PIN' : 'Set PIN'}
                      onAction={() => {
                        setApprovalPinUser(user);
                        setApprovalPin('');
                      }}
                      disabled={locked || loading || isSavingAuthorization}
                    />
                  );
                })}
                {nonCashierDiscountApprovers
                  .filter((user) => user?.is_master_admin !== true && !['admin', 'manager'].includes(String(user?.role || '').trim().toLowerCase()))
                  .map((user) => {
                    const hasDiscountAuthorization = resolveUserPermissionList(user).includes('pos:discount_authorize');
                    const isSavingAuthorization = Number(discountAuthorizationSavingUserId) === Number(user?.user_id);
                    const canConfigurePin = hasDiscountAuthorization && user?.is_active !== false;
                    return (
                      <div key={`discount-approver-${user.user_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-extrabold text-[#0F172A]">{user.username || user.email}</p>
                          <p className="text-[11px] capitalize text-[#64748B]">{user.role} · {hasDiscountAuthorization ? (user.pos_approval_pin_configured ? 'PIN configured' : 'PIN not set') : 'Authorization off'}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          <div className="flex items-center gap-2 text-[11px] font-extrabold text-[#334155]">
                            <span>Can authorize discounts</span>
                            <button
                              type="button"
                              role="switch"
                              aria-label={`Can authorize discounts for ${user.username || user.email || `user ${user.user_id}`}`}
                              aria-checked={hasDiscountAuthorization}
                              onClick={() => updateDiscountAuthorization(user, !hasDiscountAuthorization)}
                              disabled={locked || loading || isSavingAuthorization}
                              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 ${hasDiscountAuthorization ? 'border-[#2563EB] bg-[#2563EB]' : 'border-slate-300 bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${hasDiscountAuthorization ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                          </div>
                          {canConfigurePin ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-lg px-3 text-[13px] font-extrabold text-[#1A4E8D] sm:text-[14px]"
                              onClick={() => {
                                setApprovalPinUser(user);
                                setApprovalPin('');
                              }}
                              disabled={locked || loading || isSavingAuthorization}
                            >
                              <KeyRound className="mr-1.5 h-4 w-4" />
                              {user.pos_approval_pin_configured ? 'Reset PIN' : 'Set PIN'}
                            </Button>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-700">Enable access first</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-extrabold text-[#0F172A]">Day Close Access</p>
                      <p className="mt-1 text-[11px] text-[#64748B]">Allow Z-reading for selected cashiers.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg px-3 text-[13px] font-extrabold sm:text-[14px]"
                      onClick={() => loadDayCloseOperators()}
                      disabled={locked || loading || dayCloseOperatorsLoading}
                    >
                      {dayCloseOperatorsLoading ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {nonCashierDayCloseOperators.map((user) => {
                      const isMasterAdmin = user?.is_master_admin === true;
                      const hasDayCloseAccess = isMasterAdmin || resolveUserPermissionList(user).includes('pos:close_day');
                      const isSavingAccess = Number(dayCloseAccessSavingUserId) === Number(user?.user_id);
                      return (
                        <div key={`day-close-operator-${user.user_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-extrabold text-[#0F172A]">{user.username || user.email}</p>
                            <p className="truncate text-[10px] font-medium text-[#94A3B8]">{user.email || 'No account email'}</p>
                            <p className="text-[11px] capitalize text-[#64748B]">
                              {user.role} · {hasDayCloseAccess
                                ? (user.pos_day_close_pin_configured ? 'PIN configured' : 'PIN setup pending')
                                : 'Z-reading access off'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-3">
                            {isMasterAdmin ? (
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-[#1A4E8D]">Built-in access</span>
                            ) : (
                              <div className="flex items-center gap-2 text-[11px] font-extrabold text-[#334155]">
                                <span>Can generate Z-reading</span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-label={`Can generate Z-reading for ${user.username || user.email || `user ${user.user_id}`}`}
                                  aria-checked={hasDayCloseAccess}
                                  onClick={() => updateDayCloseAccess(user, !hasDayCloseAccess)}
                                  disabled={locked || loading || isSavingAccess}
                                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 ${hasDayCloseAccess ? 'border-[#2563EB] bg-[#2563EB]' : 'border-slate-300 bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${hasDayCloseAccess ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                              </div>
                            )}
                            {hasDayCloseAccess && user.pos_day_close_pin_configured ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-lg px-3 text-[13px] font-extrabold text-blue-700 sm:text-[14px]"
                                onClick={() => {
                                  setDayClosePinUser(user);
                                }}
                                disabled={locked || loading || isSavingAccess}
                              >
                                <KeyRound className="mr-1.5 h-4 w-4" />
                                Reset PIN
                              </Button>
                            ) : hasDayCloseAccess ? (
                              <span className="text-[11px] font-bold text-amber-700">Cashier setup pending</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {!dayCloseOperatorsLoading && nonCashierDayCloseOperators.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-[12px] text-[#64748B]">No employee accounts available. Manage cashier access in Terminals.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
      </div>
      <PosSettingsAccessPinModal
        open={settingsPinDialogOpen}
        values={posForm}
        locked={locked || loading}
        saving={settingsPinSaving}
        onOpenChange={closeSettingsPinDialog}
        onChange={(value) => updateAccessPin((current) => ({
          ...current,
          settingsAccessPin: value,
          clearSettingsAccessPin: false
        }))}
        onSave={() => void saveSettingsPin()}
        onClear={() => void clearSettingsPin()}
      />
      </section>
  );
}

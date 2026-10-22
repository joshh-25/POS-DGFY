import { AlertCircle, ChevronDown, Percent, Save, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { POS_MODAL_FOOTER_SURFACE_CLASS, POS_MODAL_HEADER_SURFACE_CLASS } from '../components/posModalStyles.js';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

function PolicyToggle({ label, description, checked, onCheckedChange, icon: Icon, disabled }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3 py-3.5 sm:px-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-[#0F172A]">{label}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">{description}</p>
        </div>
      </div>
      <Switch
        aria-label={label}
        checked={checked === true}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={checked === true ? 'bg-[#2563EB] focus-visible:ring-[#2563EB]' : 'bg-slate-200 focus-visible:ring-[#2563EB]'}
      />
    </div>
  );
}

export function TerminalPolicyFields({
  values,
  locked = false,
  saving = false,
  onChange,
  idPrefix = 'pos-terminal'
}) {
  const mode = values?.terminalRegistryMode || 'warn';
  const isEnforceMode = mode === 'enforce';
  const registryModeId = `${idPrefix}-registry-mode`;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor={registryModeId} className="text-[12px] font-bold text-slate-700">Terminal Registry Mode</Label>
            <div className="relative flex items-center">
              <select
                id={registryModeId}
                className="h-9 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                value={mode}
                onChange={(event) => onChange?.('terminalRegistryMode', event.target.value)}
                disabled={locked || saving}
              >
                <option value="warn">Warn (allow manual IDs)</option>
                <option value="enforce">Enforce (registry only)</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[11px] leading-4 text-[#536B8C]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <span>
              {isEnforceMode
                ? 'Enforce mode blocks unlock, open-shift, and checkout when the terminal ID is not in the active registry.'
                : 'Warn mode allows manual or fallback terminal IDs while showing policy warnings.'}
            </span>
          </div>
        </div>
      </div>

      <PolicyToggle
        label="Strict Shift Location Binding"
        description="Require location-bound terminal readiness for shift open, checkout, and terminal switching."
        checked={values?.terminalLocationBindingEnforced === true}
        onCheckedChange={(enabled) => onChange?.('terminalLocationBindingEnforced', enabled === true)}
        icon={ShieldCheck}
        disabled={locked || saving}
      />
      <PolicyToggle
        label="Voucher Redemption at POS"
        description="Allow cashiers to redeem voucher codes at checkout when this tenant feature is ready."
        checked={values?.voucherPosRedemptionEnabled === true}
        onCheckedChange={(enabled) => onChange?.('voucherPosRedemptionEnabled', enabled === true)}
        icon={Percent}
        disabled={locked || saving}
      />
    </>
  );
}

export default function PosTerminalAdvancedSettingsModal({
  open,
  values,
  locked = false,
  saving = false,
  onOpenChange,
  onChange,
  onSave
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} overlayClassName="bg-black/30 backdrop-blur-none">
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#D9E5F3] bg-white p-0 shadow-2xl shadow-slate-950/15 sm:w-full">
        <DialogHeader className={['rounded-t-2xl px-5 py-4 text-left sm:px-6', POS_MODAL_HEADER_SURFACE_CLASS].join(' ')}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">Advanced Terminal Settings</DialogTitle>
              <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">
                Set terminal policy behavior and optional POS voucher access. These settings apply across the POS workspace.
              </DialogDescription>
            </div>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"
              onClick={() => onOpenChange?.(false)}
              aria-label="Close advanced terminal settings dialog"
              disabled={saving}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </DialogHeader>

        <div className="grid gap-4 px-5 py-5 sm:px-6">
          <TerminalPolicyFields values={values} locked={locked} saving={saving} onChange={onChange} />
        </div>

        <DialogFooter className={['px-5 py-4 sm:px-6 sm:pt-4', POS_MODAL_FOOTER_SURFACE_CLASS].join(' ')}>
          <Button
            type="button"
            variant="outline"
            className="min-h-9 w-full rounded-xl px-4 text-[13px] font-bold sm:w-auto"
            onClick={() => onOpenChange?.(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-9 w-full gap-1.5 rounded-xl bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto"
            onClick={onSave}
            disabled={locked || saving}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

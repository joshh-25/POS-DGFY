import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PosSettingsAccessPinModal({
  open,
  values,
  locked = false,
  saving = false,
  onOpenChange,
  onChange,
  onSave,
  onClear
}) {
  const isConfigured = values?.settingsAccessPinEnabled === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} overlayClassName="bg-black/30 backdrop-blur-none">
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-[16px] font-extrabold text-[#0F172A]">
            <KeyRound className="h-5 w-5 text-[#1A4E8D]" aria-hidden="true" />
            Settings Access PIN
          </DialogTitle>
          <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">
            This PIN protects sensitive POS settings for non-master-admin users. It cannot be viewed after saving.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-[11px] leading-4 text-[#536B8C]">
            {isConfigured
              ? 'A PIN is configured. Enter a new 4 to 12 digit PIN to replace it.'
              : 'Create a 4 to 12 digit PIN to protect Settings access.'}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pos-settings-access-pin" className="text-[12px] font-bold text-slate-700">
              {isConfigured ? 'New Settings Access PIN' : 'Settings Access PIN'}
            </Label>
            <Input
              id="pos-settings-access-pin"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              style={{ WebkitTextSecurity: 'disc' }}
              className="h-9 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
              value={values?.settingsAccessPin || ''}
              onChange={(event) => onChange?.(event.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="Enter 4 to 12 digits"
              disabled={locked || saving}
            />
            <p className="text-[11px] leading-4 text-[#64748B]">
              Use a PIN that non-master-admin staff can enter when opening protected Settings pages.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-100 px-5 py-4 sm:px-6 sm:pt-4">
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {isConfigured ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-9 w-full rounded-xl border-rose-200 px-4 text-[13px] font-bold text-rose-600 hover:bg-rose-50 sm:w-auto"
                  onClick={onClear}
                  disabled={locked || saving}
                >
                  Clear PIN
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
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
                className="min-h-9 w-full rounded-xl bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto"
                onClick={onSave}
                disabled={locked || saving}
              >
                {saving ? 'Saving...' : 'Save PIN'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

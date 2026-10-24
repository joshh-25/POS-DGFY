import { Banknote, CircleDollarSign, Clock, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { POS_MODAL_FOOTER_SURFACE_CLASS, POS_MODAL_HEADER_SURFACE_CLASS } from '../components/posModalStyles.js';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_CONFIG = [
  {
    key: 'pettyCashSymbol',
    label: 'Petty Cash Currency Symbol',
    placeholder: 'e.g. PHP',
    description: 'Shown beside petty cash amounts during closeout.',
    icon: CircleDollarSign,
    inputProps: { maxLength: 12, autoComplete: 'off' }
  },
  {
    key: 'pettyCashAmount',
    label: 'Petty Cash Amount',
    placeholder: 'e.g. 500.00',
    description: 'Starting cash amount used for new shifts.',
    icon: Banknote,
    inputProps: { type: 'number', min: '0', step: '0.01', inputMode: 'decimal' }
  },
  {
    key: 'posWaitTimeMinutes',
    label: 'Default Wait Time',
    placeholder: 'e.g. 15',
    description: 'Wait time in minutes for queue and order defaults.',
    icon: Clock,
    inputProps: { type: 'number', min: '0', step: '1', inputMode: 'numeric' }
  },
  {
    key: 'inventoryLowStockDisplayThreshold',
    label: 'Low Stock Alert Threshold',
    placeholder: 'e.g. 5',
    description: 'Item quantity that triggers the low-stock display.',
    icon: Banknote,
    inputProps: { type: 'number', min: '0', step: '1', inputMode: 'numeric' }
  }
];

export default function PosCashierCloseoutDefaultsModal({
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
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto rounded-2xl border border-[#D9E5F3] bg-white p-0 shadow-2xl shadow-slate-950/15 sm:w-full">
        <DialogHeader className={['rounded-t-2xl px-5 py-4 text-left sm:px-6', POS_MODAL_HEADER_SURFACE_CLASS].join(' ')}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">Edit Cashier Closeout Defaults</DialogTitle>
            </div>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"
              onClick={() => onOpenChange?.(false)}
              aria-label="Close edit Cashier Closeout Defaults dialog"
              disabled={saving}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </DialogHeader>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {FIELD_CONFIG.map((field) => {
            const Icon = field.icon;
            const fieldId = `pos-closeout-${field.key}`;
            return (
              <div key={field.key} className="grid gap-1.5">
                <Label htmlFor={fieldId} className="text-[12px] font-bold text-slate-700">
                  {field.label}
                </Label>
                <div className="relative flex items-center">
                  <Icon className="pointer-events-none absolute left-3 h-4 w-4 text-[#1A4E8D]" aria-hidden="true" />
                  <Input
                    id={fieldId}
                    className="h-9 rounded-xl border-slate-200 pl-10 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={values?.[field.key] ?? ''}
                    onChange={(event) => onChange?.(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    disabled={locked || saving}
                    {...field.inputProps}
                  />
                </div>
                <p className="text-[11px] leading-4 text-[#64748B]">{field.description}</p>
              </div>
            );
          })}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2.5 text-[11px] leading-4 text-[#536B8C] sm:col-span-2">
            Queue Location follows the active shift and cannot be changed from this dialog.
          </div>
        </div>

        <DialogFooter className={['flex-row items-center justify-between gap-2 px-5 py-4 sm:justify-end sm:gap-6 sm:px-6 sm:pt-4', POS_MODAL_FOOTER_SURFACE_CLASS].join(' ')}>
          <Button
            type="button"
            variant="outline"
            className="min-h-9 min-w-0 flex-1 rounded-xl px-4 text-[13px] font-bold sm:w-auto sm:flex-none"
            onClick={() => onOpenChange?.(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-9 min-w-0 flex-1 gap-1.5 rounded-xl bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:flex-none"
            onClick={onSave}
            disabled={locked || saving}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving...' : 'Save Defaults'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

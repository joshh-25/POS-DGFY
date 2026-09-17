import { Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function PosAddTerminalModal({
  open,
  draft,
  locations,
  editingLocationName,
  locked = false,
  loading = false,
  saving = false,
  editing = false,
  onOpenChange,
  onChange,
  onSave,
  onDelete
}) {
  const disabled = locked || loading || saving;
  const title = editing ? `Edit ${draft?.terminal_id || 'terminal'}` : 'Add terminal';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} overlayClassName="bg-black/30 backdrop-blur-none">
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">{title}</DialogTitle>
              <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">
                {editing ? 'Update the terminal details and its store location.' : 'Register a terminal and assign it to a store location.'}
              </DialogDescription>
            </div>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"
              onClick={() => onOpenChange?.(false)}
              aria-label={`Close ${editing ? 'edit' : 'add'} terminal dialog`}
              disabled={saving}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </DialogHeader>

        <div className="grid gap-4 px-5 py-5 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pos-add-terminal-id" className="text-[12px] font-extrabold text-[#334155]">Terminal ID</Label>
              <Input
                id="pos-add-terminal-id"
                value={draft?.terminal_id || ''}
                onChange={(event) => onChange?.('terminal_id', event.target.value)}
                placeholder="COUNTER-01"
                disabled={disabled}
                className="h-9 rounded-lg border-slate-200 bg-white text-[13px]"
              />
              <p className="text-[11px] leading-4 text-[#64748B]">Use a unique ID such as COUNTER-01.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pos-add-terminal-label" className="text-[12px] font-extrabold text-[#334155]">Terminal label</Label>
              <Input
                id="pos-add-terminal-label"
                value={draft?.label || ''}
                onChange={(event) => onChange?.('label', event.target.value)}
                placeholder="Main counter"
                disabled={disabled}
                className="h-9 rounded-lg border-slate-200 bg-white text-[13px]"
              />
              <p className="text-[11px] leading-4 text-[#64748B]">A short name customers and cashiers will recognize.</p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pos-add-terminal-location" className="text-[12px] font-extrabold text-[#334155]">Store location</Label>
            <select
              id="pos-add-terminal-location"
              value={draft?.location_id || ''}
              onChange={(event) => onChange?.('location_id', event.target.value)}
              disabled={disabled}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Select a store location</option>
              {(Array.isArray(locations) ? locations : []).map((location) => (
                <option key={`terminal-add-location-${location.location_id}`} value={location.location_id}>{location.name}</option>
              ))}
            </select>
            <p className="text-[11px] leading-4 text-[#64748B]">{editingLocationName ? `Cashiers assigned to ${editingLocationName} appear below.` : 'Assign a store location to show its cashiers.'}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div>
                <p className="text-[13px] font-extrabold text-[#0F172A] sm:text-[14px]">Active terminal</p>
                <p className="text-[11px] leading-4 text-[#64748B]">Allow this terminal to be selected at sign-in.</p>
              </div>
              <Switch
                aria-label="Active terminal"
                checked={draft?.is_active !== false}
                onCheckedChange={(value) => onChange?.('is_active', value === true)}
                disabled={disabled}
                className={draft?.is_active !== false ? 'bg-[#2563EB] focus-visible:ring-[#2563EB]' : 'bg-slate-200 focus-visible:ring-[#2563EB]'}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div>
                <p className="text-[13px] font-extrabold text-[#0F172A] sm:text-[14px]">Default terminal</p>
                <p className="text-[11px] leading-4 text-[#64748B]">Use this terminal when no terminal is selected.</p>
              </div>
              <Switch
                aria-label="Default terminal"
                checked={draft?.is_default === true}
                onCheckedChange={(value) => onChange?.('is_default', value === true)}
                disabled={disabled || draft?.is_active === false}
                className={draft?.is_default === true ? 'bg-[#2563EB] focus-visible:ring-[#2563EB]' : 'bg-slate-200 focus-visible:ring-[#2563EB]'}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse items-stretch gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-4">
          {editing ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-9 w-full gap-1.5 rounded-xl border-rose-200 px-4 text-[13px] font-extrabold text-rose-600 hover:bg-rose-50 sm:w-auto sm:text-[14px]"
              onClick={onDelete}
              disabled={disabled}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete terminal
            </Button>
          ) : <span aria-hidden="true" />}
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-9 w-full rounded-xl px-4 text-[13px] font-bold sm:w-auto sm:text-[14px]"
              onClick={() => onOpenChange?.(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-9 w-full gap-1.5 rounded-xl bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:text-[14px]"
              onClick={onSave}
              disabled={disabled}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add terminal'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

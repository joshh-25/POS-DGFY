import { useState } from 'react';
import { AlertTriangle, Banknote, CircleDollarSign, Clock, Edit3, MapPin, Settings2, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PosCashierCloseoutDefaultsModal from './PosCashierCloseoutDefaultsModal.jsx';

const displayValue = (value, fallback = 'Not set') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const formatAmount = (symbol, amount) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return 'Not set';
  return `${displayValue(symbol, 'PHP')} ${numericAmount.toFixed(2)}`;
};

function PreviewItem({ label, value, description, icon: Icon, action = null }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <dt className="text-[12px] font-bold text-[#1A4E8D]">{label}</dt>
        <dd className="mt-1 break-words text-[13px] font-bold text-[#0F172A] sm:text-[14px]">{value}</dd>
        {description ? <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#64748B]">{description}</p> : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}

function DirectToggle({ label, description, checked, onChange, disabled, pending = false, icon: Icon }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[#0F172A] sm:text-[14px]">{label}</p>
          {description ? <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#64748B]">{description}</p> : null}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked === true}
        onClick={onChange}
        disabled={disabled || pending}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`pointer-events-none absolute inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent px-0.5 transition-colors motion-reduce:transition-none ${checked === true ? 'bg-[#1A4E8D]' : 'bg-slate-200'}`}>
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${checked === true ? 'translate-x-5' : 'translate-x-0'}`} />
        </span>
      </button>
    </div>
  );
}

export default function PosOperationsDefaultsSection({
  loading, savingTab, posForm, locations, incomingOrders,
  queueLocationScopeId, onlineOrderSoundEnabled, setOnlineOrderSoundEnabled, locked,
  saveDefaults, onNavigateToOrders = () => {}
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValues, setDraftValues] = useState(null);
  const saving = savingTab === 'pos_setup';
  const canEdit = !locked && !loading;
  const queueLocation = (Array.isArray(locations) ? locations : [])
    .find((location) => String(location?.location_id) === String(queueLocationScopeId));
  const queueLocationLabel = loading
    ? 'Loading...'
    : displayValue(queueLocation?.name, queueLocationScopeId ? 'Location unavailable' : 'No active shift');

  const beginEditing = () => {
    setDraftValues({
      pettyCashSymbol: posForm?.pettyCashSymbol ?? '',
      pettyCashAmount: posForm?.pettyCashAmount ?? 0,
      posWaitTimeMinutes: posForm?.posWaitTimeMinutes ?? 15,
      inventoryLowStockDisplayThreshold: posForm?.inventoryLowStockDisplayThreshold ?? 5
    });
    setIsEditing(true);
  };

  const closeEditing = () => {
    if (saving) return;
    setDraftValues(null);
    setIsEditing(false);
  };

  const saveEditing = async () => {
    if (!draftValues) return;
    const saved = await saveDefaults(draftValues);
    if (saved === true) {
      setDraftValues(null);
      setIsEditing(false);
    }
  };

  const togglePosVisibility = () => {
    const nextValues = { ...posForm, posOpenStatus: posForm?.posOpenStatus !== true };
    void saveDefaults(nextValues);
  };

  return (
    <>
      <section aria-labelledby="pos-operations-defaults-title">
        <div className="space-y-4">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]">
                <Banknote className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 id="pos-operations-defaults-title" className="text-[16px] font-extrabold text-[#0F172A]">Cashier Closeout</h3>
                <p className="mt-1 text-[13px] leading-5 text-[#64748B]">
                  Shift and queue defaults.
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="min-h-9 w-full gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-bold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:text-[14px]"
              onClick={beginEditing}
              disabled={!canEdit || saving}
            >
              <Edit3 className="h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
          </div>

          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <PreviewItem
                label="Queue Location (Active Shift)"
                value={queueLocationLabel}
                icon={MapPin}
              />
              <PreviewItem
                label="Petty Cash Currency"
                value={displayValue(posForm?.pettyCashSymbol, 'PHP')}
                icon={CircleDollarSign}
              />
              <PreviewItem
                label="Petty Cash Amount"
                value={formatAmount(posForm?.pettyCashSymbol, posForm?.pettyCashAmount)}
                icon={Banknote}
              />
              <PreviewItem
                label="Default Wait Time"
                value={`${displayValue(posForm?.posWaitTimeMinutes, '15')} minutes`}
                icon={Clock}
              />
              <PreviewItem
                label="Low Stock Alert Threshold"
                value={`${displayValue(posForm?.inventoryLowStockDisplayThreshold, '5')} items`}
                icon={AlertTriangle}
              />
              <PreviewItem
                label="Live Queue"
                value={`${Array.isArray(incomingOrders) ? incomingOrders.length : 0} orders`}
                icon={Settings2}
                action={(
                  <Button
                    type="button"
                    className="min-h-8 rounded-lg bg-[#1A4E8D] px-3 text-[11px] font-extrabold text-white shadow-sm hover:bg-[#143F73]"
                    onClick={onNavigateToOrders}
                  >
                    Go to Orders
                  </Button>
                )}
              />
            </dl>

            <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <DirectToggle
                label="POS visible to customers"
                checked={posForm?.posOpenStatus === true}
                onChange={togglePosVisibility}
                disabled={!canEdit}
                pending={saving}
                icon={Settings2}
              />
              <DirectToggle
                label="Online order sound"
                checked={onlineOrderSoundEnabled === true}
                onChange={() => setOnlineOrderSoundEnabled((current) => !current)}
                disabled={!canEdit}
                icon={Volume2}
              />
            </div>
          </>
        </div>
      </section>

      <PosCashierCloseoutDefaultsModal
        open={isEditing}
        values={draftValues}
        locked={!canEdit}
        saving={saving}
        onOpenChange={(open) => { if (!open) closeEditing(); }}
        onChange={(key, value) => setDraftValues((current) => ({ ...current, [key]: value }))}
        onSave={saveEditing}
      />
    </>
  );
}

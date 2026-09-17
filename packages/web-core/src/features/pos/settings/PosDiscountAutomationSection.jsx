import { Plus, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const switchClassName = (enabled) => (
  enabled ? 'bg-[#1A4E8D] focus-visible:ring-[#1A4E8D]' : 'bg-slate-200 focus-visible:ring-[#1A4E8D]'
);

function DiscountPresetRow({ profile, index, locked, loading, onChange, onRemove }) {
  const active = profile.active !== false;

  return (
    <div className="grid gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_8rem_auto_auto] sm:items-end sm:gap-4 sm:px-4">
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`pos-discount-name-${index}`} className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
          Discount name
        </Label>
        <Input
          id={`pos-discount-name-${index}`}
          className="h-9 rounded-lg border-slate-200 text-[13px] font-semibold text-[#0F172A] sm:text-[14px]"
          value={profile.name || ''}
          placeholder="e.g. Employee discount"
          onChange={(event) => onChange(index, 'name', event.target.value)}
          disabled={locked || loading}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`pos-discount-percent-${index}`} className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
          Rate
        </Label>
        <div className="relative">
          <Input
            id={`pos-discount-percent-${index}`}
            className="h-9 rounded-lg border-slate-200 pr-7 text-[13px] font-semibold text-[#0F172A] sm:text-[14px]"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={profile.percentage ?? ''}
            placeholder="20"
            aria-label={`Discount rate for preset ${index + 1}`}
            onChange={(event) => onChange(index, 'percentage', event.target.value)}
            disabled={locked || loading}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-bold text-[#64748B]">%</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:min-w-24 sm:justify-start">
        <div>
          <p className="text-[12px] font-extrabold text-[#0F172A]">Active</p>
          <p className={`text-[10px] font-semibold ${active ? 'text-[#1A4E8D]' : 'text-[#64748B]'}`}>{active ? 'Enabled' : 'Disabled'}</p>
        </div>
        <Switch
          aria-label={`Active discount preset ${index + 1}`}
          checked={active}
          onCheckedChange={(checked) => onChange(index, 'active', checked === true)}
          disabled={locked || loading}
          className={switchClassName(active)}
        />
      </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 justify-self-end rounded-lg border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500/30"
          onClick={() => onRemove(index)}
        disabled={locked || loading}
        aria-label={`Remove discount profile ${index + 1}`}
        title="Remove discount"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function AutomationRule({ id, label, description, checked, onCheckedChange, locked, loading }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3 sm:px-4">
      <div className="min-w-0">
        <p className="text-[13px] font-extrabold text-[#0F172A] sm:text-[14px]">{label}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`hidden text-[10px] font-bold sm:inline ${checked ? 'text-[#1A4E8D]' : 'text-[#64748B]'}`}>
          {checked ? 'Enabled' : 'Disabled'}
        </span>
        <Switch
          id={id}
          aria-label={label}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={locked || loading}
          className={switchClassName(checked)}
        />
      </div>
    </div>
  );
}

export default function PosDiscountAutomationSection({
  locked, loading, posForm, setPosForm, handleDiscountProfileChange, addDiscountProfile, removeDiscountProfile
}) {
  const discountProfiles = Array.isArray(posForm.discountProfiles) ? posForm.discountProfiles : [];

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <section aria-labelledby="pos-discount-presets-title" className="border-b border-slate-200 pb-4 sm:pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]">
              <Tag className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="pos-discount-presets-title" className="text-[16px] font-extrabold text-[#0F172A]">POS Discount Presets</h3>
              <p className="mt-1 text-[12px] leading-5 text-[#64748B]">Create reusable discounts that cashiers can select during checkout.</p>
            </div>
          </div>
          <div className="flex w-full sm:w-auto sm:shrink-0">
            <Button
              type="button"
              variant="outline"
              className="min-h-9 w-full gap-1.5 rounded-lg border-slate-200 px-3 text-[13px] font-extrabold text-[#1A4E8D] hover:border-[#1A4E8D] hover:bg-blue-50 sm:w-auto sm:text-[14px]"
              onClick={addDiscountProfile}
              disabled={locked || loading}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Discount
            </Button>
          </div>
        </div>

        {discountProfiles.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white sm:mt-4" aria-label="POS discount presets">
            {discountProfiles.map((profile, index) => (
              <DiscountPresetRow
                key={`discount-profile-${index}`}
                profile={profile}
                index={index}
                locked={locked}
                loading={loading}
                onChange={handleDiscountProfileChange}
                onRemove={removeDiscountProfile}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-[12px] font-semibold text-[#64748B] sm:mt-4">
            No discount presets configured yet. Add one to make a reusable checkout discount available to cashiers.
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 sm:mt-4 sm:px-4">
          <div className="min-w-0">
            <p className="text-[12px] font-extrabold text-amber-950">Allow employee discount self-approval</p>
            <p className="mt-0.5 text-[11px] leading-4 text-amber-800">
              Let the cashier receiving an Employee discount authorize it with their configured POS approval PIN. Self-approvals remain in the transaction audit.
            </p>
          </div>
          <Switch
            id="pos-employee-discount-self-approval"
            aria-label="Allow employee discount self-approval"
            checked={posForm.employeeDiscountSelfApprovalEnabled === true}
            onCheckedChange={(checked) => setPosForm((current) => ({
              ...current,
              employeeDiscountSelfApprovalEnabled: Boolean(checked)
            }))}
            disabled={locked || loading}
            className={switchClassName(posForm.employeeDiscountSelfApprovalEnabled === true)}
          />
        </div>
      </section>

      <section aria-labelledby="pos-best-seller-settings-title">
        <div>
          <h3 id="pos-best-seller-settings-title" className="text-[16px] font-extrabold text-[#0F172A]">Best Seller Autotagging Settings</h3>
          <p className="mt-1 text-[12px] leading-5 text-[#64748B]">Keep best seller labels current from recent completed paid sales.</p>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white sm:mt-4" aria-label="Best seller automation rules">
          <AutomationRule
            id="pos-best-seller-auto-tagging"
            label="Top 3 items · rolling 30 days"
            description="Tag the top three items by completed paid quantity from the previous 30 days."
            checked={posForm.bestSellerAutoTaggingEnabled === true}
            onCheckedChange={(checked) => setPosForm((current) => ({
              ...current,
              bestSellerAutoTaggingEnabled: Boolean(checked)
            }))}
            locked={locked}
            loading={loading}
          />
          <AutomationRule
            id="pos-best-seller-daily-auto-tagging"
            label="Most-bought item · previous day"
            description="Tag the most-bought item by completed paid quantity from the previous day."
            checked={posForm.dailyTopBestSellerEnabled === true}
            onCheckedChange={(checked) => setPosForm((current) => ({
              ...current,
              dailyTopBestSellerEnabled: Boolean(checked)
            }))}
            locked={locked}
            loading={loading}
          />
        </div>
      </section>
    </div>
  );
}

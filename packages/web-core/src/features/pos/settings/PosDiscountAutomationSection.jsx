import { Tag } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const switchClassName = (enabled) => (
  enabled ? 'bg-[#1A4E8D] focus-visible:ring-[#1A4E8D]' : 'bg-slate-200 focus-visible:ring-[#1A4E8D]'
);

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
  locked, loading, posForm, setPosForm
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
              <h3 id="pos-discount-presets-title" className="text-[16px] font-extrabold text-[#0F172A]">Discount Management</h3>
              <p className="mt-1 text-[12px] leading-5 text-[#64748B]">Discounts are now managed with Enabled and Approved controls in the Discount Management tab.</p>
            </div>
          </div>
        </div>

        {discountProfiles.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white sm:mt-4" aria-label="Migrated POS discount presets">
            {discountProfiles.map((profile, index) => (
              <div key={`discount-profile-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:px-4">
                <span className="min-w-0 truncate text-[13px] font-bold text-[#0F172A]">{profile.name || 'Unnamed discount'}</span>
                <span className="shrink-0 text-[12px] font-semibold text-[#64748B]">{Number(profile.percentage || 0)}% · migrated</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-[12px] font-semibold text-[#64748B] sm:mt-4">
            No legacy discount presets detected. Use Discount Management to create and approve a configurable discount.
          </div>
        )}

        <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-3 text-[11px] leading-5 text-blue-900 sm:px-4">
          Existing presets are preserved for migration and compatibility. They are no longer edited or used as the browser POS transaction source.
        </p>

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

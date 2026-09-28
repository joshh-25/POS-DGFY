import { Receipt, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  normalizePosTaxPolicies,
  POS_TAX_POLICY_TYPES,
  POS_TAX_POLICY_TYPE_LABELS,
  POS_TAX_TREATMENT_OPTIONS
} from './posTaxPolicies.js';

const PREVIEW_GROSS_AMOUNT = 100;
const PREVIEW_VAT_RATE = 0.12;
const PREVIEW_EMBEDDED_VAT = PREVIEW_GROSS_AMOUNT - (PREVIEW_GROSS_AMOUNT / (1 + PREVIEW_VAT_RATE));
const formatMoney = (value) => `PHP ${Number(value).toFixed(2)}`;

export default function PosTaxSettingsPane({
  policies,
  setPolicies,
  locked = false,
  loading = false,
  saving = false,
  canEdit = true,
  dirty = false,
  onSave = async () => true,
  onCancel = () => {}
}) {
  const normalizedPolicies = normalizePosTaxPolicies(policies);
  const disabled = locked || loading || saving || !canEdit;

  const updateTreatment = (type, vatTreatment) => {
    if (disabled) return;
    setPolicies((current) => {
      const normalized = normalizePosTaxPolicies(current);
      return {
        ...normalized,
        categories: {
          ...normalized.categories,
          [type]: { vat_treatment: vatTreatment }
        }
      };
    });
  };

  return (
    <section aria-labelledby="pos-tax-settings-heading" className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF3FF] text-[#1A4E8D]">
            <Receipt className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="pos-tax-settings-heading" className="text-[16px] font-extrabold tracking-tight text-[#0F172A]">
              Taxes
            </h2>
            <p className="mt-1 text-[12px] font-medium leading-5 text-[#6F86A8]">
              Choose how VAT is treated for each POS discount and promotion category.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-[#F1F7FF] px-4 py-3 text-[12px] leading-5 text-[#35577F] sm:px-5">
        Senior Citizen and PWD keep their existing statutory discount rules. This screen controls
        VAT treatment only; discount rates, approval requirements, promos, and vouchers remain owned
        by their existing POS policies.
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {POS_TAX_POLICY_TYPES.map((type) => {
          const selectedTreatment = normalizedPolicies.categories[type].vat_treatment;
          const selectedOption = POS_TAX_TREATMENT_OPTIONS.find((option) => option.value === selectedTreatment);
          const selectId = `pos-tax-treatment-${type}`;
          return (
            <div key={type} className="rounded-2xl border border-[#DDE8F5] bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <label htmlFor={selectId} className="text-[14px] font-extrabold text-[#0F172A]">
                    {POS_TAX_POLICY_TYPE_LABELS[type]}
                  </label>
                  <p className="mt-1 text-[12px] leading-5 text-[#6F86A8]">
                    {selectedOption?.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#F1F7FF] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#1A4E8D]">
                  VAT
                </span>
              </div>
              <select
                id={selectId}
                aria-label={`${POS_TAX_POLICY_TYPE_LABELS[type]} VAT treatment`}
                value={selectedTreatment}
                onChange={(event) => updateTreatment(type, event.target.value)}
                disabled={disabled}
                className="mt-4 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-[#0F172A] outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
              >
                {POS_TAX_TREATMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#6F86A8]">Example calculation</p>
        <p className="mt-1 text-[12px] leading-5 text-slate-600">
          For a vatable item priced at {formatMoney(PREVIEW_GROSS_AMOUNT)}, removing embedded VAT
          removes {formatMoney(PREVIEW_EMBEDDED_VAT)} and leaves a taxable base of {formatMoney(PREVIEW_GROSS_AMOUNT - PREVIEW_EMBEDDED_VAT)}.
        </p>
      </div>

      <div className="flex flex-row justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-10 min-w-0 flex-1 gap-1.5 rounded-xl px-4 text-[13px] font-bold sm:flex-none"
          onClick={onCancel}
          disabled={saving || !dirty}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Cancel
        </Button>
        <Button
          type="button"
          className="min-h-10 min-w-0 flex-1 gap-1.5 rounded-xl bg-[#1A4E8D] px-4 text-[13px] font-bold text-white hover:bg-[#143F73] sm:flex-none"
          onClick={() => void onSave(normalizedPolicies)}
          disabled={disabled || !dirty}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving...' : 'Save Taxes'}
        </Button>
      </div>
    </section>
  );
}

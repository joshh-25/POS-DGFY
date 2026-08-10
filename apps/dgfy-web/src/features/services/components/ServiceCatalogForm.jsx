import React from 'react';
import { Plus } from 'lucide-react';

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60';

const Field = ({ label, htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-600">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

const ToggleField = ({ label, description, checked, onChange, disabled, ariaLabel }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <span className="pr-3">
      <strong className="block text-sm text-slate-800">{label}</strong>
      <small className="text-xs text-slate-500">{description}</small>
    </span>
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);

export default function ServiceCatalogForm({
  values,
  onChange,
  onSubmit,
  saving = false,
  disabled = false,
  title = 'New Service',
  submitLabel = 'Create Service',
  showStatus = false,
  idPrefix = 'service-catalog',
  className = 'rounded-lg border border-slate-200 bg-white p-4'
}) {
  const controlsDisabled = saving || disabled;
  const updateField = (field, value) => onChange?.({ ...values, [field]: value });

  return (
    <form onSubmit={onSubmit} className={className} aria-busy={saving}>
      <div className="mb-3 flex items-center gap-2">
        <Plus className="h-5 w-5 text-teal-700" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="grid gap-3">
        <Field label="Service Name" htmlFor={`${idPrefix}-name`}>
          <input
            id={`${idPrefix}-name`}
            required
            value={values.name}
            onChange={(event) => updateField('name', event.target.value)}
            className={inputClass}
            disabled={controlsDisabled}
          />
        </Field>
        <Field label="Description" htmlFor={`${idPrefix}-description`}>
          <textarea
            id={`${idPrefix}-description`}
            value={values.description}
            onChange={(event) => updateField('description', event.target.value)}
            className={`${inputClass} min-h-[72px]`}
            placeholder="Describe what is included in this service."
            disabled={controlsDisabled}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" htmlFor={`${idPrefix}-code`}>
            <input
              id={`${idPrefix}-code`}
              value={values.sku_code}
              onChange={(event) => updateField('sku_code', event.target.value)}
              className={inputClass}
              disabled={controlsDisabled}
            />
          </Field>
          <Field label="Category" htmlFor={`${idPrefix}-category`}>
            <input
              id={`${idPrefix}-category`}
              value={values.service_category}
              onChange={(event) => updateField('service_category', event.target.value)}
              className={inputClass}
              disabled={controlsDisabled}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buffer Before (minutes)" htmlFor={`${idPrefix}-buffer-before`}>
            <input id={`${idPrefix}-buffer-before`} type="number" min="0" value={values.buffer_before_minutes} onChange={(event) => updateField('buffer_before_minutes', event.target.value)} className={inputClass} disabled={controlsDisabled} />
          </Field>
          <Field label="Buffer After (minutes)" htmlFor={`${idPrefix}-buffer-after`}>
            <input id={`${idPrefix}-buffer-after`} type="number" min="0" value={values.buffer_after_minutes} onChange={(event) => updateField('buffer_after_minutes', event.target.value)} className={inputClass} disabled={controlsDisabled} />
          </Field>
          <Field label="Lead Time (minutes)" htmlFor={`${idPrefix}-lead-time`}>
            <input id={`${idPrefix}-lead-time`} type="number" min="0" value={values.lead_time_minutes} onChange={(event) => updateField('lead_time_minutes', event.target.value)} className={inputClass} disabled={controlsDisabled} />
          </Field>
          <Field label="Cancellation Window (hours)" htmlFor={`${idPrefix}-cancellation-window`}>
            <input id={`${idPrefix}-cancellation-window`} type="number" min="0" value={values.cancellation_window_hours} onChange={(event) => updateField('cancellation_window_hours', event.target.value)} className={inputClass} disabled={controlsDisabled} />
          </Field>
        </div>
        <ToggleField
          label="Track Internal Cost"
          description="Keep an optional internal cost for profitability reporting."
          ariaLabel="Track internal service cost"
          checked={values.track_internal_cost === true}
          onChange={(checked) => updateField('track_internal_cost', checked)}
          disabled={controlsDisabled}
        />
        {values.track_internal_cost === true ? (
          <Field label="Internal Service Cost" htmlFor={`${idPrefix}-internal-cost`}>
            <input id={`${idPrefix}-internal-cost`} type="number" min="0" step="0.01" value={values.cost_per_unit} onChange={(event) => updateField('cost_per_unit', event.target.value)} className={inputClass} disabled={controlsDisabled} />
          </Field>
        ) : null}
        <Field label="VAT Classification" htmlFor={`${idPrefix}-vat-type`}>
          <select id={`${idPrefix}-vat-type`} value={values.vat_type} onChange={(event) => updateField('vat_type', event.target.value)} className={inputClass} disabled={controlsDisabled}>
            <option value="vatable">VATable</option>
            <option value="vat_exempt">VAT Exempt</option>
            <option value="zero_rated">Zero Rated</option>
          </select>
        </Field>
        <Field label="Unit" htmlFor={`${idPrefix}-unit`}>
          <select
            id={`${idPrefix}-unit`}
            value={values.unit_of_measure}
            onChange={(event) => updateField('unit_of_measure', event.target.value)}
            className={inputClass}
            disabled={controlsDisabled}
          >
            <option value="service">Service</option>
            <option value="session">Session</option>
            <option value="booking">Booking</option>
            <option value="hour">Hour</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration" htmlFor={`${idPrefix}-duration`}>
            <input
              id={`${idPrefix}-duration`}
              type="number"
              min="1"
              value={values.duration_minutes}
              onChange={(event) => updateField('duration_minutes', event.target.value)}
              className={inputClass}
              disabled={controlsDisabled}
            />
          </Field>
          <Field label="Price" htmlFor={`${idPrefix}-price`}>
            <input
              id={`${idPrefix}-price`}
              required
              type="number"
              min="0.01"
              step="0.01"
              value={values.default_sale_price}
              onChange={(event) => updateField('default_sale_price', event.target.value)}
              className={inputClass}
              disabled={controlsDisabled}
            />
          </Field>
        </div>
        <Field label="Payment Policy" htmlFor={`${idPrefix}-payment-policy`}>
          <select
            id={`${idPrefix}-payment-policy`}
            value={values.payment_policy}
            onChange={(event) => updateField('payment_policy', event.target.value)}
            className={inputClass}
            disabled={controlsDisabled}
          >
            <option value="customer_choice">Customer Choice</option>
            <option value="prepaid_required">Prepaid Required</option>
            <option value="postpaid_only">Postpaid Only</option>
            <option value="deposit_allowed">Deposit Allowed</option>
          </select>
        </Field>
        <Field label="Service Area" htmlFor={`${idPrefix}-service-area`}>
          <select
            id={`${idPrefix}-service-area`}
            value={values.service_area_type}
            onChange={(event) => updateField('service_area_type', event.target.value)}
            className={inputClass}
            disabled={controlsDisabled}
          >
            <option value="in_store">In Store</option>
            <option value="customer_location">Customer Location</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label="Intake Question" htmlFor={`${idPrefix}-intake-question`}>
          <textarea
            id={`${idPrefix}-intake-question`}
            value={values.intake_question}
            onChange={(event) => updateField('intake_question', event.target.value)}
            className={`${inputClass} min-h-[70px]`}
            placeholder="Example: What concern should we prepare for?"
            disabled={controlsDisabled}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Answer Type" htmlFor={`${idPrefix}-intake-type`}>
            <select
              id={`${idPrefix}-intake-type`}
              value={values.intake_question_type}
              onChange={(event) => updateField('intake_question_type', event.target.value)}
              className={inputClass}
              disabled={controlsDisabled}
            >
              <option value="textarea">Long Answer</option>
              <option value="text">Short Answer</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="checkbox">Checkbox</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={values.intake_question_required === true}
              onChange={(event) => updateField('intake_question_required', event.target.checked)}
              disabled={controlsDisabled}
            />
            Required
          </label>
        </div>
        <Field label="Client Notes Template" htmlFor={`${idPrefix}-client-notes`}>
          <textarea id={`${idPrefix}-client-notes`} value={values.client_notes_template} onChange={(event) => updateField('client_notes_template', event.target.value)} className={`${inputClass} min-h-[70px]`} placeholder="Optional notes template for staff." disabled={controlsDisabled} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleField label="Bookable" description="Allow this service to be scheduled." ariaLabel="Make this service bookable" checked={values.bookable !== false} onChange={(checked) => updateField('bookable', checked)} disabled={controlsDisabled} />
          <ToggleField label="Show in POS" description="Make this service available to POS operators." ariaLabel="Show this service in POS" checked={values.visible_in_pos !== false} onChange={(checked) => updateField('visible_in_pos', checked)} disabled={controlsDisabled} />
          <ToggleField label="Show in Storefront" description="Publish this service to eligible storefront customers." ariaLabel="Show this service in Storefront" checked={values.visible_in_storefront !== false} onChange={(checked) => updateField('visible_in_storefront', checked)} disabled={controlsDisabled} />
          <ToggleField label="Allow Add-ons" description="Show assigned add-on groups when selected." ariaLabel="Allow add-ons for this service" checked={values.addons_enabled === true} onChange={(checked) => updateField('addons_enabled', checked)} disabled={controlsDisabled} />
        </div>
        {showStatus ? (
          <Field label="Status" htmlFor={`${idPrefix}-status`}>
            <select id={`${idPrefix}-status`} value={values.status} onChange={(event) => updateField('status', event.target.value)} className={inputClass} disabled={controlsDisabled}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        ) : null}
        <button type="submit" disabled={controlsDisabled} className={primaryButtonClass}>
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

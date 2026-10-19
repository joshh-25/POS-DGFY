import { useId, useState } from 'react';
import { AlertCircle, MapPin } from 'lucide-react';
import { composeMerchantAddress, MERCHANT_ADDRESS_DETAILS_MAX_LENGTH } from './merchantAddressDetails.js';

/**
 * #2595: the merchant's street number, unit, floor or building, shown next to the store-location
 * picker. The picker supplies the geocoded location; this supplies the part geocoding cannot, and
 * the preview shows the full address customers and riders will see (composeMerchantAddress).
 *
 * The error appears once the merchant leaves the field empty, or when the caller sets
 * `showError` after a blocked save.
 */
export default function MerchantAddressDetailsField({
  value = '',
  onChange = () => {},
  locationAddress = '',
  disabled = false,
  showError = false,
  label = 'Street no., unit, floor or building',
  placeholder = 'e.g. 118, Ground floor, Atrium Bldg',
  helpText = 'Geocoding cannot find this part. Customers and riders see it first.',
  previewLabel = 'Customers and riders will see',
  inputClassName = '',
  className = ''
}) {
  const inputId = useId();
  const messageId = useId();
  const [touched, setTouched] = useState(false);

  const details = String(value || '').trim();
  const location = String(locationAddress || '').trim();
  const invalid = !disabled && !details && (touched || showError);

  return (
    <div className={`grid gap-2 ${className}`.trim()}>
      <div className="grid gap-1">
        <label htmlFor={inputId} className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-700">
          <span>{label}</span>
          <span className="shrink-0 text-[11px] font-bold text-rose-800">Required</span>
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          placeholder={placeholder}
          maxLength={MERCHANT_ADDRESS_DETAILS_MAX_LENGTH}
          autoComplete="address-line1"
          disabled={disabled}
          aria-required="true"
          aria-invalid={invalid}
          aria-describedby={messageId}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500 ${invalid ? 'border-2 border-rose-700' : 'border-slate-300'} ${inputClassName}`.trim()}
        />
        {invalid ? (
          <p id={messageId} role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
            <AlertCircle size={14} aria-hidden="true" className="shrink-0" />
            Add the street number, unit or building so riders can find the store.
          </p>
        ) : (
          <p id={messageId} className="text-xs text-slate-600">{helpText}</p>
        )}
      </div>
      {location ? (
        <section
          aria-label="Store address preview"
          className={`grid gap-1 rounded-lg px-3 py-2.5 ${details ? 'border border-blue-200 bg-blue-50' : 'border border-dashed border-slate-300 bg-white'}`}
        >
          <span className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
            <MapPin size={14} aria-hidden="true" />
            {previewLabel}
          </span>
          {details ? (
            <span data-testid="merchant-address-preview" className="break-words text-sm font-semibold text-slate-900">
              {composeMerchantAddress(details, location)}
            </span>
          ) : (
            <span data-testid="merchant-address-preview" className="break-words text-sm text-slate-600">
              <span className="rounded border border-dashed border-slate-400 px-1">street no. or unit</span>, {location}
            </span>
          )}
        </section>
      ) : null}
    </div>
  );
}

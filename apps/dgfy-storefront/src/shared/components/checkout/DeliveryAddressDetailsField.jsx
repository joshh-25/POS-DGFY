import { useId, useState } from 'react';
import { AlertCircle, MapPin } from 'lucide-react';
import { composeDeliveryAddress } from '../../../features/locations/utils/pinnedDeliveryAddress.js';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY } from './checkoutUiTokens.js';

const ERROR_TEXT = '#9f1239';
const ERROR_BORDER = '#be123c';

/**
 * #2594: the customer's own house number, Blk/Lot, unit or building, shown under the delivery
 * location field. Geocoding cannot supply this part (OSM has almost no house numbers in PH
 * cities), so it is required; the order's `delivery_address` is `<details>, <location>`
 * (composeDeliveryAddress). The preview shows the rider-facing address as it will be sent.
 *
 * The error appears once the customer leaves the field empty, or when the caller sets
 * `showError` after a blocked Continue.
 */
export function DeliveryAddressDetailsField({
  value = '',
  onValueChange = () => {},
  locationAddress = '',
  showError = false,
  isMobileViewport = false,
  label = 'House no., Blk/Lot, unit or building',
  placeholder = 'e.g. Blk 5 Lot 12, Unit 3B, blue gate',
  helpText = 'The rider uses this to find your door.',
  previewLabel = 'Rider will see',
  accentColor = '#1a4e8d',
  accentTint = '#eef4fb',
  accentBorder = '#b9cfe8'
}) {
  const inputId = useId();
  const messageId = useId();
  const [touched, setTouched] = useState(false);

  const details = String(value || '').trim();
  const location = String(locationAddress || '').trim();
  const invalid = !details && (touched || showError);
  const inputFontSize = isMobileViewport ? 16 : 13;

  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0, fontFamily: CHECKOUT_FONT_FAMILY }}>
      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <label htmlFor={inputId} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 12, lineHeight: 1.35, fontWeight: 600, color: '#475569' }}>
          <span>{label}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: ERROR_TEXT, flexShrink: 0 }}>Required</span>
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete="address-line1"
          enterKeyHint="done"
          maxLength={255}
          aria-required="true"
          aria-invalid={invalid}
          aria-describedby={messageId}
          onChange={(event) => onValueChange(event.target.value)}
          onBlur={() => setTouched(true)}
          style={{ minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, border: invalid ? `2px solid ${ERROR_BORDER}` : '1px solid #94a3b8', background: '#fff', padding: '0 12px', color: '#1e293b', fontSize: inputFontSize, fontWeight: 500, fontFamily: CHECKOUT_FONT_FAMILY, boxSizing: 'border-box', width: '100%', minWidth: 0, outline: 'none' }}
        />
        {invalid ? (
          <div id={messageId} role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: ERROR_TEXT }}>
            <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            Add your house number or unit so the rider can find you.
          </div>
        ) : (
          <div id={messageId} style={{ fontSize: 12, lineHeight: 1.45, color: '#5b6b7f' }}>{helpText}</div>
        )}
      </div>
      {location ? (
        <section
          aria-label="Delivery address preview"
          style={{ display: 'grid', gap: 6, padding: '12px 14px', borderRadius: 14, background: details ? accentTint : '#fff', border: details ? `1px solid ${accentBorder}` : '1px dashed #b9c4d0', minWidth: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: accentColor }}>
            <MapPin size={14} aria-hidden="true" />
            {previewLabel}
          </div>
          {details ? (
            <div data-testid="delivery-address-preview" style={{ fontSize: 14, lineHeight: 1.45, fontWeight: 600, color: '#1e293b', overflowWrap: 'anywhere' }}>
              {composeDeliveryAddress(details, location)}
            </div>
          ) : (
            <div data-testid="delivery-address-preview" style={{ fontSize: 14, lineHeight: 1.45, color: '#5b6b7f', overflowWrap: 'anywhere' }}>
              <span style={{ border: '1px dashed #94a3b8', borderRadius: 4, padding: '0 4px' }}>your house or unit</span>, {location}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

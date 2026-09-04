import { Info, Store, Truck } from 'lucide-react';
import { CHECKOUT_FONT_FAMILY, getCheckoutStepTypography } from './checkoutUiTokens.js';

const DGFY_BLUE = '#1a4e8d';

/**
 * The disclosure that replaces the fulfillment chooser when the store offers exactly one
 * method (or, defensively, none). Shared by every mode so copy, iconography, and layout do
 * not drift; `accentColor` is used only by generic informational notices.
 *
 * `variant="warning"` is used for the zero-available-method case so it does not read as a
 * neutral confirmation of something the customer can proceed with.
 */
export function FulfillmentMethodNotice({
  accentColor = '#1a4e8d',
  message = '',
  variant = 'info',
  ...props
}) {
  if (!message) return null;
  const typography = getCheckoutStepTypography();

  if (variant === 'delivery-only' || variant === 'pickup-only') {
    const isPickupOnly = variant === 'pickup-only';
    const title = isPickupOnly ? 'Pickup only' : 'Delivery only';
    const description = isPickupOnly
      ? 'This store only offers pickup. Delivery is not available.'
      : 'This store only offers delivery. Pickup is not available.';
    const theme = isPickupOnly
      ? { border: '#bae6fd', background: '#f0f9ff', icon: '#0284c7', title: '#0369a1', text: '#164e63' }
      : { border: '#bfdbfe', background: '#eff6ff', icon: DGFY_BLUE, title: '#0f4fb8', text: '#1e3a5f' };

    return (
      <div
        role="note"
        data-testid={`${variant}-fulfillment-notice`}
        {...props}
        style={{ display: 'flex', alignItems: 'center', gap: 16, border: `1px solid ${theme.border}`, background: theme.background, borderRadius: 14, padding: '16px 18px', boxSizing: 'border-box' }}
      >
        <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: '50%', background: theme.icon, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {isPickupOnly ? <Store size={28} strokeWidth={2.25} /> : <Truck size={28} strokeWidth={2.25} />}
        </span>
        <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <span style={{ ...typography.sectionTitle, color: theme.title, fontFamily: CHECKOUT_FONT_FAMILY }}>{title}</span>
          <span style={{ ...typography.description, color: theme.text, fontFamily: CHECKOUT_FONT_FAMILY }}>{description}</span>
        </span>
      </div>
    );
  }

  const isWarning = variant === 'warning';
  const border = isWarning ? '#fde68a' : '#dbe5ee';
  const background = isWarning ? '#fffbeb' : '#f8fafc';
  const color = isWarning ? '#92400e' : '#334155';

  return (
    <div
      role={isWarning ? 'alert' : 'note'}
      data-testid="fulfillment-method-notice"
      {...props}
      style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${border}`, background, borderRadius: 12, padding: '10px 12px', boxSizing: 'border-box' }}
    >
      <Info size={14} color={isWarning ? '#b45309' : accentColor} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color, lineHeight: 1.35 }}>{message}</span>
    </div>
  );
}

export default FulfillmentMethodNotice;

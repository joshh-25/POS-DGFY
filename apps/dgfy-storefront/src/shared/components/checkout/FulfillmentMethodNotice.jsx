import { Info } from 'lucide-react';

/**
 * #1217: the static line that replaces the fulfillment chooser when the store offers exactly
 * one method (or, defensively, none). Shared by every mode so the copy and the affordance
 * read identically; `accentColor` is the only thing a mode varies.
 *
 * `variant="warning"` is used for the zero-available-method case so it does not read as a
 * neutral confirmation of something the customer can proceed with.
 */
export function FulfillmentMethodNotice({
  accentColor = '#1a4e8d',
  message = '',
  variant = 'info'
}) {
  if (!message) return null;
  const isWarning = variant === 'warning';
  const border = isWarning ? '#fde68a' : '#dbe5ee';
  const background = isWarning ? '#fffbeb' : '#f8fafc';
  const color = isWarning ? '#92400e' : '#334155';

  return (
    <div
      role={isWarning ? 'alert' : 'note'}
      data-testid="fulfillment-method-notice"
      style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${border}`, background, borderRadius: 12, padding: '10px 12px', boxSizing: 'border-box' }}
    >
      <Info size={14} color={isWarning ? '#b45309' : accentColor} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color, lineHeight: 1.35 }}>{message}</span>
    </div>
  );
}

export default FulfillmentMethodNotice;

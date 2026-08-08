import { Check, ShoppingBag, Truck } from 'lucide-react';

/**
 * Services' own handoff chooser: pick up items and deliver to the customer's address, or
 * pick up items for in-store collection. No now/schedule choice — Services always books a
 * calendar date/time (see ServiceBookingDetailsForm rendered alongside this in the Fulfillment
 * step), so there is nothing to toggle here beyond the handoff method.
 *
 * Uses a local option card (not the shared SelectableOptionCard) because its labels are full
 * sentences that need to wrap across two lines in a two-column layout — the shared primitive
 * forces single-line, ellipsis-truncated labels, which isn't safe to change since F&B/Retail/
 * MSME rely on it for their own (shorter) labels.
 */
function HandoffOptionCard({ active, icon, label, onClick, servicesPrimary, servicesPrimaryShadow, minHeight }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight,
        width: '100%',
        borderRadius: 14,
        border: `1.5px solid ${active ? servicesPrimary : '#dbe5ee'}`,
        background: active ? '#e8f4ff' : '#fff',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: active ? `0 8px 20px ${servicesPrimaryShadow}` : 'none',
        boxSizing: 'border-box',
        transition: 'all 200ms ease',
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: active ? '#dff3f8' : '#f8fafc', display: 'grid', placeItems: 'center', color: active ? servicesPrimary : '#1e293b', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: '1 1 0%', minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.35, color: active ? '#1e293b' : '#334155' }}>
        {label}
      </div>
      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${active ? servicesPrimary : '#dbe5ee'}`, background: active ? servicesPrimary : '#fff', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {active ? <Check size={12} strokeWidth={3.2} /> : null}
      </div>
    </button>
  );
}

export function ServiceBookingFulfillmentChoices({
  isMobileViewport,
  onOrderMethodChange,
  serviceOrderMethod,
  servicesPrimary,
  servicesPrimaryShadow
}) {
  const minHeight = isMobileViewport ? 64 : 68;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>1. Handoff</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
        <HandoffOptionCard
          active={serviceOrderMethod === 'delivery'}
          icon={<Truck size={20} />}
          label="Pick up and deliver"
          onClick={() => onOrderMethodChange('delivery')}
          servicesPrimary={servicesPrimary}
          servicesPrimaryShadow={servicesPrimaryShadow}
          minHeight={minHeight}
        />
        <HandoffOptionCard
          active={serviceOrderMethod === 'pickup'}
          icon={<ShoppingBag size={20} />}
          label="Pick up and I'll collect"
          onClick={() => onOrderMethodChange('pickup')}
          servicesPrimary={servicesPrimary}
          servicesPrimaryShadow={servicesPrimaryShadow}
          minHeight={minHeight}
        />
      </div>
    </div>
  );
}

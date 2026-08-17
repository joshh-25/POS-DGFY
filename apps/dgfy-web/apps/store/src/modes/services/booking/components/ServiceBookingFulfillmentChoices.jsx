import { Check, Package, ShoppingBag, Truck } from 'lucide-react';
import {
  getServicesLocalFlowOptions
} from '../model/servicesLocalFlow.js';

/**
 * Services' own handoff chooser: pick up items and deliver to the customer's address, or
 * pick up items for in-store collection. No now/schedule choice — Services always books a
 * calendar date/time (see ServiceBookingDetailsForm rendered alongside this in the Fulfillment
 * step). The timing choice is kept separate so the customer can choose Now or Schedule for later.
 *
 * Uses a local option card (not the shared SelectableOptionCard) because its labels are full
 * sentences that need to wrap across two lines in a two-column layout — the shared primitive
 * forces single-line, ellipsis-truncated labels, which isn't safe to change since F&B/Retail/
 * MSME rely on it for their own (shorter) labels.
 *
 * The two options here correspond to the `item_pickup_return` and
 * `item_pickup_collection` fulfillment profiles (issue #178, ADR 0057) —
 * both `status: 'planned'` in that vocabulary, which is why the customer's
 * choice here is presentation-only and never reaches the booking payload
 * (ADR 0057 clause 3: the vocabulary may shape client-side checkout
 * composition, never an API/database field). Display copy and `value`s
 * are unchanged from before this file referenced the vocabulary.
 */
const ICONS = { package: Package, 'shopping-bag': ShoppingBag, truck: Truck };
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
  const options = getServicesLocalFlowOptions({ includePlanned: false });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 5 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>1. Service flow</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
        {options.map(({ profileKey, method, label, icon }) => {
          const Icon = ICONS[icon] || Package;
          return (
          <HandoffOptionCard
            key={profileKey}
            active={serviceOrderMethod === method}
            icon={<Icon size={20} />}
            label={label}
            onClick={() => onOrderMethodChange(method)}
            servicesPrimary={servicesPrimary}
            servicesPrimaryShadow={servicesPrimaryShadow}
            minHeight={minHeight}
          />
          );
        })}
      </div>
    </div>
  );
}

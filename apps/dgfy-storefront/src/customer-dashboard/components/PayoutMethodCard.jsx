import React, { useState } from 'react';
import { Edit2, Landmark, Smartphone, Star, Trash2 } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

/**
 * PayoutMethodCard
 *
 * Same visual structure/spacing as the storefront's SavedAddressCard
 * (shared/components/checkout/SavedAddressCard.jsx), cloned rather than
 * reused directly because payout methods have no "select for checkout"
 * concept and need a bank/e-wallet icon instead of a location pin.
 *
 * Props:
 *   method      {payout_method_id, method_type, title, subtitle, isDefault}
 *   isBusy      bool — dims the card and disables action buttons during API calls
 *   onSetDefault fn(method) — called when "Set default" is tapped
 *   onEdit      fn(method)
 *   onRemove    fn(method)
 */
export function PayoutMethodCard({
  method,
  isBusy = false,
  onSetDefault,
  onEdit,
  onRemove,
  themeColor = '#1a4e8d',
  themeBg = '#eff6ff'
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handleSetDefault = (event) => {
    event.stopPropagation();
    if (!isBusy && typeof onSetDefault === 'function') onSetDefault(method);
  };
  const handleEdit = (event) => {
    event.stopPropagation();
    if (!isBusy && typeof onEdit === 'function') onEdit(method);
  };
  const handleRemove = (event) => {
    event.stopPropagation();
    if (!isBusy && typeof onRemove === 'function') onRemove(method);
  };

  const containerStyle = {
    position: 'relative',
    borderRadius: 16,
    border: isHovered && !isBusy ? '1.5px solid #93c5fd' : '1.5px solid #dbe5ee',
    background: isHovered && !isBusy ? '#f8fbff' : '#ffffff',
    boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    transition: 'border-color 180ms ease, background 180ms ease',
    cursor: isBusy ? 'wait' : 'default'
  };

  const iconCircleStyle = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: themeBg,
    color: themeColor,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0
  };

  const actionButtonBase = {
    border: 'none',
    background: 'transparent',
    padding: 0,
    minHeight: 40,
    paddingInline: 6,
    fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction,
    fontWeight: 700,
    cursor: isBusy ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    opacity: isBusy ? 0.5 : 1
  };

  const Icon = method.method_type === 'bank' ? Landmark : Smartphone;

  return (
    <div style={containerStyle} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {method.isDefault ? (
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span style={{ background: '#dbeafe', color: themeColor, borderRadius: 999, padding: '3px 8px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 800, lineHeight: 1.4, userSelect: 'none', boxShadow: '0 6px 16px rgba(37,99,235,0.12)' }}>Default</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingRight: method.isDefault ? 64 : 0 }}>
        <div style={iconCircleStyle}><Icon size={16} strokeWidth={2} /></div>
        <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
          <p style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, margin: 0 }}>{method.title}</p>
          {method.subtitle ? <p style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, fontWeight: 400, color: '#64748b', lineHeight: 1.4, marginTop: 2, margin: 0 }}>{method.subtitle}</p> : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingLeft: 44, flexWrap: 'wrap' }}>
        <div style={{ minHeight: 18 }}>
          {!method.isDefault && typeof onSetDefault === 'function' ? (
            <button type="button" disabled={isBusy} onClick={handleSetDefault} style={{ ...actionButtonBase, color: themeColor }}>
              <Star size={13} strokeWidth={2} /> Set Default
            </button>
          ) : null}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {typeof onEdit === 'function' ? (
            <button type="button" disabled={isBusy} onClick={handleEdit} style={{ ...actionButtonBase, color: themeColor }}>
              <Edit2 size={13} strokeWidth={2} /> Edit
            </button>
          ) : null}
          {typeof onRemove === 'function' ? (
            <button type="button" disabled={isBusy} onClick={handleRemove} style={{ ...actionButtonBase, color: '#ef4444' }}>
              <Trash2 size={13} strokeWidth={2} /> Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PayoutMethodCardEmpty({ message = 'No payout methods yet. Add a bank account or e-wallet below.' }) {
  return (
    <div style={{ borderRadius: 16, border: '1px dashed #cbd5e1', background: '#f8fafc', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, color: '#64748b', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 600 }}>
      <Landmark size={18} color="#94a3b8" />
      {message}
    </div>
  );
}

export default PayoutMethodCard;

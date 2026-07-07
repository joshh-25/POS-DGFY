import React, { useState } from 'react';
import { Edit2, MapPin, Star, Trash2 } from 'lucide-react';

/**
 * SavedAddressCard
 *
 * Reusable card for a single saved delivery address.
 * Used in:
 *   - F&B checkout delivery picker (StorefrontApp.jsx)
 *   - DGFY customer account dashboard addresses panel (DgfyCustomerAccountPage.jsx)
 *
 * Props:
 *   address     {id, addressId, label, fullAddress, isDefault, source}
 *   isSelected  bool  — applies blue glow + tinted background
 *   isBusy      bool  — dims the card and disables action buttons during API calls
 *   onSelect    fn(address) — called when the card body is clicked
 *   onSetDefault fn(address) — called when "Set default" is tapped (explicit action)
 *   onRemove    fn(address) — called when "Remove" is tapped
 *   showActions bool  — whether to render Set default / Remove buttons
 */
export function SavedAddressCard({
  address,
  isSelected = false,
  isBusy = false,
  onSelect,
  onSetDefault,
  onEdit,
  onRemove,
  showActions = true,
  themeColor = '#1a4e8d',
  themeBg = '#eff6ff',
  themeHoverBorder = '#93c5fd',
  themeHoverBg = '#f8fafc',
  themeShadowColor = 'rgba(26,78,141,0.12)',
  themeShadowColorSoft = 'rgba(26,78,141,0.08)',
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handleSelect = () => {
    if (!isBusy && typeof onSelect === 'function') onSelect(address);
  };

  const handleSetDefault = (event) => {
    event.stopPropagation();
    if (!isBusy && typeof onSetDefault === 'function') onSetDefault(address);
  };

  const handleEdit = (event) => {
    event.stopPropagation();
    if (!isBusy && typeof onEdit === 'function') onEdit(address);
  };

  const handleRemove = (event) => {
    event.stopPropagation();
    if (!isBusy && typeof onRemove === 'function') onRemove(address);
  };

  const isHoverActive = isHovered && !isSelected && !isBusy;

  const containerStyle = {
    position: 'relative',
    borderRadius: 16,
    border: isSelected
      ? `1.5px solid ${themeColor}`
      : isHoverActive
        ? `1.5px solid ${themeHoverBorder}`
        : '1.5px solid #dbe5ee',
    background: isSelected ? themeBg : isHoverActive ? themeHoverBg : '#ffffff',
    boxShadow: isSelected ? `0 0 0 3px ${themeShadowColor}, 0 12px 28px ${themeShadowColorSoft}` : '0 1px 2px rgba(15,23,42,0.03)',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    transition: 'border-color 180ms ease, box-shadow 180ms ease, background 180ms ease, transform 180ms ease',
    opacity: 1,
    cursor: isBusy ? 'wait' : 'default',
    transform: isSelected ? 'translateY(-1px)' : 'translateY(0)',
  };

  const iconCircleStyle = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: isSelected ? themeColor : themeBg,
    color: isSelected ? '#ffffff' : themeColor,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    transition: 'background 150ms, color 150ms',
  };

  const primaryTextStyle = {
    fontSize: 13,
    fontWeight: 700,
    color: '#0f172a',
    lineHeight: 1.3,
    margin: 0,
  };

  const secondaryTextStyle = {
    fontSize: 11,
    fontWeight: 400,
    color: '#64748b',
    lineHeight: 1.4,
    marginTop: 2,
    margin: 0,
  };
  const actionButtonBase = {
    border: 'none',
    background: 'transparent',
    padding: 0,
    fontSize: 12,
    fontWeight: 700,
    cursor: isBusy ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    opacity: isBusy ? 0.5 : 1,
    transition: 'opacity 150ms',
  };

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Default badge — top-right absolute */}
      {address.isDefault ? (
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span style={{
            background: '#dbeafe',
            color: themeColor,
            borderRadius: 999,
            padding: '3px 8px',
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1.4,
            userSelect: 'none',
            boxShadow: '0 6px 16px rgba(37,99,235,0.12)',
          }}>
            Default
          </span>
        </div>
      ) : null}

      {/* Card body — clickable to select */}
      <button
        type="button"
        disabled={isBusy}
        onClick={handleSelect}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          textAlign: 'left',
          cursor: isBusy ? 'not-allowed' : 'pointer',
          width: '100%',
          paddingRight: address.isDefault ? 64 : 0,
        }}
      >
        {/* Location icon */}
        <div style={iconCircleStyle}>
          <MapPin size={16} strokeWidth={2} />
        </div>

        {/* Text content */}
        <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
          <p style={primaryTextStyle}>{address.label || 'Saved Address'}</p>
          {address.fullAddress ? (
            <p style={secondaryTextStyle}>{address.fullAddress}</p>
          ) : null}
        </div>
      </button>

      {/* Action row */}
      {showActions ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingLeft: 44, flexWrap: 'wrap' }}>
          <div style={{ minHeight: 18 }}>
            {!address.isDefault && typeof onSetDefault === 'function' ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleSetDefault}
                style={{ ...actionButtonBase, color: themeColor }}
              >
                <Star size={13} strokeWidth={2} />
                Set Default
              </button>
            ) : null}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {typeof onEdit === 'function' ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleEdit}
                style={{ ...actionButtonBase, color: themeColor }}
              >
                <Edit2 size={13} strokeWidth={2} />
                Edit
              </button>
            ) : null}
            {typeof onRemove === 'function' ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleRemove}
                style={{ ...actionButtonBase, color: '#ef4444' }}
              >
                <Trash2 size={13} strokeWidth={2} />
                Delete
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * SavedAddressCardLoading
 * Placeholder skeleton shown while the address list is fetching.
 */
export function SavedAddressCardLoading() {
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px dashed #cbd5e1',
        background: '#f8fafc',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 72,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: '#e2e8f0',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, display: 'grid', gap: 8 }}>
        <div style={{ height: 14, borderRadius: 6, background: '#e2e8f0', width: '60%' }} />
        <div style={{ height: 12, borderRadius: 6, background: '#e2e8f0', width: '80%' }} />
      </div>
    </div>
  );
}

/**
 * SavedAddressCardEmpty
 * Shown when no saved addresses exist.
 */
export function SavedAddressCardEmpty({ message = 'No saved addresses yet. Add or pin a new one.' }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px dashed #cbd5e1',
        background: '#f8fafc',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 64,
        color: '#64748b',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <MapPin size={18} color="#94a3b8" />
      {message}
    </div>
  );
}

/**
 * SavedAddressCardError
 * Shown when the address fetch fails.
 */
export function SavedAddressCardError({ message = 'Unable to load saved addresses.' }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid #fecaca',
        background: '#fff1f2',
        padding: '12px 14px',
        color: '#b91c1c',
        fontSize: 12,
        lineHeight: 1.5,
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  );
}

export default SavedAddressCard;

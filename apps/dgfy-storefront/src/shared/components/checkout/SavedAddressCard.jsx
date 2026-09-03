import React, { useEffect, useRef, useState } from 'react';
import { Edit2, MapPin, MoreHorizontal, Star, Trash2 } from 'lucide-react';

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
 *   layoutVariant string — use "dashboard" for the compact account-address layout
 *   isMobileViewport bool — lets the dashboard layout stack actions at narrow widths
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
  layoutVariant = 'checkout',
  isMobileViewport = false,
  themeColor = '#1a4e8d',
  themeBg = '#eff6ff',
  themeHoverBorder = '#93c5fd',
  themeHoverBg = '#f8fafc',
  themeShadowColor = 'rgba(26,78,141,0.12)',
  themeShadowColorSoft = 'rgba(26,78,141,0.08)',
  compact = false,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (layoutVariant !== 'dashboard' || !isMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setIsMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen, layoutVariant]);

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

  const handleDashboardMenuAction = (event, action) => {
    event.stopPropagation();
    setIsMenuOpen(false);
    if (!isBusy && typeof action === 'function') action(address);
  };

  const isHoverActive = isHovered && !isSelected && !isBusy;

  const containerStyle = {
    position: 'relative',
    borderRadius: compact ? 14 : 16,
    border: isSelected
      ? `1.5px solid ${themeColor}`
      : isHoverActive
        ? `1.5px solid ${themeHoverBorder}`
        : '1.5px solid #dbe5ee',
    background: isSelected ? themeBg : isHoverActive ? themeHoverBg : '#ffffff',
    boxShadow: isSelected ? `0 0 0 3px ${themeShadowColor}, 0 12px 28px ${themeShadowColorSoft}` : '0 1px 2px rgba(15,23,42,0.03)',
    padding: compact ? '10px 12px' : '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? 7 : 10,
    transition: 'border-color 180ms ease, box-shadow 180ms ease, background 180ms ease, transform 180ms ease',
    opacity: 1,
    cursor: isBusy ? 'wait' : 'default',
    transform: isSelected ? 'translateY(-1px)' : 'translateY(0)',
  };

  const iconCircleStyle = {
    width: compact ? 30 : 32,
    height: compact ? 30 : 32,
    borderRadius: '50%',
    background: isSelected ? themeColor : themeBg,
    color: isSelected ? '#ffffff' : themeColor,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    transition: 'background 150ms, color 150ms',
  };

  const primaryTextStyle = {
    fontSize: compact ? 12 : 13,
    fontWeight: 700,
    color: '#0f172a',
    lineHeight: 1.25,
    margin: 0,
  };

  const secondaryTextStyle = {
    fontSize: compact ? 10.5 : 11,
    fontWeight: 400,
    color: '#64748b',
    lineHeight: 1.35,
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

  if (layoutVariant === 'dashboard') {
    const addressTitle = address.label || 'Saved Address';
    const dashboardActionStyle = {
      minHeight: isMobileViewport ? 44 : 40,
      border: 'none',
      background: 'transparent',
      borderRadius: 8,
      padding: '0 4px',
      color: themeColor,
      fontSize: 13,
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      cursor: isBusy ? 'not-allowed' : 'pointer',
      opacity: isBusy ? 0.5 : 1,
      whiteSpace: 'nowrap',
    };
    const dashboardMenuItemStyle = {
      width: '100%',
      minHeight: 44,
      border: 'none',
      background: '#ffffff',
      borderRadius: 8,
      padding: '0 12px',
      color: '#334155',
      fontSize: 13,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      textAlign: 'left',
      cursor: isBusy ? 'not-allowed' : 'pointer',
      opacity: isBusy ? 0.5 : 1,
    };
    const isMobileDashboard = isMobileViewport;
    const hasDashboardActions = showActions && (
      typeof onSetDefault === 'function'
      || typeof onEdit === 'function'
      || typeof onRemove === 'function'
    );

    return (
      <article
        data-testid="customer-address-card"
        aria-busy={isBusy}
        style={{
          position: 'relative',
          overflow: 'visible',
          borderRadius: 14,
          border: isSelected
            ? `1px solid ${themeColor}`
            : isHoverActive
              ? `1px solid ${themeHoverBorder}`
              : '1px solid #e2e8f0',
          borderLeft: isSelected ? `3px solid ${themeColor}` : undefined,
          background: isSelected ? '#fbfdff' : isHoverActive ? themeHoverBg : '#ffffff',
          boxShadow: isSelected
            ? `0 4px 16px ${themeShadowColorSoft}`
            : '0 2px 8px rgba(15,23,42,0.04)',
          padding: isMobileViewport ? '12px' : '16px 18px',
          display: 'grid',
          gridTemplateColumns: isMobileViewport ? '44px minmax(0, 1fr)' : '48px minmax(0, 1fr) auto',
          columnGap: isMobileViewport ? 12 : 16,
          rowGap: 8,
          alignItems: 'center',
          transition: 'border-color 180ms ease, box-shadow 180ms ease, background 180ms ease',
          opacity: 1,
          cursor: isBusy ? 'wait' : 'default',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          aria-label={typeof onSelect === 'function' ? `Use ${addressTitle} for checkout` : undefined}
          disabled={isBusy}
          onClick={handleSelect}
          style={{
            gridColumn: isMobileViewport ? '1 / -1' : '1 / 3',
            border: 'none',
            background: 'transparent',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: `${isMobileViewport ? 44 : 48}px minmax(0, 1fr)`,
            alignItems: 'center',
            columnGap: isMobileViewport ? 12 : 16,
            textAlign: 'left',
            cursor: isBusy ? 'not-allowed' : 'pointer',
            width: '100%',
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: isMobileViewport ? 44 : 48,
              height: isMobileViewport ? 44 : 48,
              borderRadius: '50%',
              background: themeBg,
              color: themeColor,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <MapPin size={isMobileViewport ? 20 : 21} strokeWidth={2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, color: '#0f172a', fontSize: 15, fontWeight: 700, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                {addressTitle}
              </p>
              {address.isDefault ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 24,
                    borderRadius: 999,
                    background: 'rgba(22, 163, 74, 0.12)',
                    color: '#15803d',
                    padding: '0 9px',
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span aria-hidden="true" style={{ marginRight: 4 }}>✓</span>
                  Default
                </span>
              ) : null}
            </div>
            {address.fullAddress ? (
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13, fontWeight: 500, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                {address.fullAddress}
              </p>
            ) : null}
          </div>
        </button>

        {hasDashboardActions ? (
          <div
            data-testid={`customer-address-actions-${address.addressId || address.id || addressTitle}`}
            style={{
              gridColumn: isMobileDashboard ? '1 / -1' : '3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: isMobileDashboard ? 8 : 12,
              rowGap: 4,
              flexWrap: 'wrap',
              minWidth: 0,
              width: '100%',
            }}
          >
            {!address.isDefault && typeof onSetDefault === 'function' ? (
              <button
                type="button"
                aria-label="Set Default"
                disabled={isBusy}
                onClick={handleSetDefault}
                style={dashboardActionStyle}
              >
                <Star size={16} strokeWidth={2} />
                Set as default
              </button>
            ) : null}
            {typeof onEdit === 'function' ? (
              <button
                type="button"
                aria-label="Edit"
                disabled={isBusy}
                onClick={handleEdit}
                style={dashboardActionStyle}
              >
                <Edit2 size={16} strokeWidth={2} />
                Edit
              </button>
            ) : null}
            {isMobileDashboard && typeof onRemove === 'function' ? (
              <button
                type="button"
                aria-label={`Delete ${addressTitle} address`}
                disabled={isBusy}
                onClick={handleRemove}
                style={{ ...dashboardActionStyle, color: '#dc2626' }}
              >
                <Trash2 size={16} strokeWidth={2} />
                Delete
              </button>
            ) : null}
            {!isMobileDashboard ? (
              <>
                <div style={{ width: 1, height: 24, background: '#e2e8f0', flexShrink: 0 }} aria-hidden="true" />
                <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label={`More actions for ${addressTitle}`}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    disabled={isBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsMenuOpen((open) => !open);
                    }}
                    style={{
                      width: 40,
                      height: 40,
                      border: '1px solid #dbe5ee',
                      borderRadius: 10,
                      background: '#ffffff',
                      color: themeColor,
                      display: 'grid',
                      placeItems: 'center',
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                      opacity: isBusy ? 0.5 : 1,
                    }}
                  >
                    <MoreHorizontal size={18} strokeWidth={2} />
                  </button>
                  {isMenuOpen ? (
                    <div
                      role="menu"
                      aria-label={`Actions for ${addressTitle}`}
                      style={{
                        position: 'absolute',
                        zIndex: 20,
                        top: 'calc(100% + 6px)',
                        right: 0,
                        width: 184,
                        padding: 5,
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        background: '#ffffff',
                        boxShadow: '0 14px 30px rgba(15,23,42,0.14)',
                      }}
                    >
                      {!address.isDefault && typeof onSetDefault === 'function' ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isBusy}
                          onClick={(event) => handleDashboardMenuAction(event, onSetDefault)}
                          style={dashboardMenuItemStyle}
                        >
                          <Star size={16} strokeWidth={2} color={themeColor} />
                          Set as default
                        </button>
                      ) : null}
                      {typeof onEdit === 'function' ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isBusy}
                          onClick={(event) => handleDashboardMenuAction(event, onEdit)}
                          style={dashboardMenuItemStyle}
                        >
                          <Edit2 size={16} strokeWidth={2} color={themeColor} />
                          Edit address
                        </button>
                      ) : null}
                      {typeof onRemove === 'function' ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isBusy}
                          onClick={(event) => handleDashboardMenuAction(event, onRemove)}
                          style={{ ...dashboardMenuItemStyle, color: '#dc2626' }}
                        >
                          <Trash2 size={16} strokeWidth={2} />
                          Delete address
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Default badge — top-right absolute */}
      {address.isDefault ? (
        <div style={{ position: 'absolute', top: compact ? 9 : 12, right: compact ? 9 : 12 }}>
          <span style={{
            background: '#dbeafe',
            color: themeColor,
            borderRadius: 999,
            padding: compact ? '2px 7px' : '3px 8px',
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
        aria-label={typeof onSelect === 'function' ? 'Use for Checkout' : undefined}
        disabled={isBusy}
        onClick={handleSelect}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: compact ? 10 : 12,
          textAlign: 'left',
          cursor: isBusy ? 'not-allowed' : 'pointer',
          width: '100%',
          paddingRight: address.isDefault ? (compact ? 52 : 64) : 0,
        }}
      >
        {/* Location icon */}
        <div style={iconCircleStyle}>
          <MapPin size={16} strokeWidth={2} />
        </div>

        {/* Text content */}
        <div style={{ minWidth: 0, flex: 1, paddingTop: compact ? 1 : 2 }}>
          <p style={{ ...primaryTextStyle, ...(compact ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' } : {}) }}>{address.label || 'Saved Address'}</p>
          {address.fullAddress ? (
            <p style={{ ...secondaryTextStyle, ...(compact ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' } : {}) }}>{address.fullAddress}</p>
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

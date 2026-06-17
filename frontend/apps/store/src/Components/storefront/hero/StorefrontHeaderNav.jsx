import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, MapPin, Menu, Package, ShoppingBag, User, X } from 'lucide-react';

const HERO_CANVAS_MAX_WIDTH = 1320;
const DGFY_HEADER_LOGO_URL = '/dgfy-logo.png';
const DGFY_DISCOVERY_HOME_URL = 'https://dgfy.ph/';
const DGFY_OCEAN_BLUE = '#1A4E8D';
const DGFY_DEEP_BLUE = '#1A4586';
const DGFY_ICE_BLUE = '#AEE8F4';

export function StorefrontHeaderNav({
  isMobileViewport,
  bodyFont,
  onBack,
  onShop,
  onTrack = null,
  onAccount = null,
  onRegisterBusiness = null,
  branchSelector = null,
  activeOrderCount = 0,
  isAuthenticated = false,
  accountName = '',
  accountEmail = '',
  accountInitials = '',
  storefrontName = '',
  storefrontModeLabel = '',
  storefrontLogoUrl = '',
  storefrontSlug = '',
  hasMultipleBranches = false
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const mobileDrawerRef = useRef(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!mobileMenuRef.current?.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen || !mobileDrawerRef.current) return undefined;
    mobileDrawerRef.current.focus();
    return undefined;
  }, [isMobileMenuOpen]);

  const resolvedInitials = useMemo(() => {
    const base = String(accountInitials || '').trim();
    if (base) return base;
    const parts = String(accountName || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'GU';
  }, [accountInitials, accountName]);

  const resolvedStorefrontName = String(storefrontName || '').trim() || 'Storefront';
  const resolvedStorefrontModeLabel = String(storefrontModeLabel || '').trim() || 'Local Business';
  const resolvedStorefrontSlug = String(storefrontSlug || '').trim();
  const resolvedStorefrontInitial = resolvedStorefrontName.charAt(0).toUpperCase() || 'S';
  const resolvedFirstName = String(accountName || '').trim().split(/\s+/).filter(Boolean)[0] || 'My Account';

  const handleDrawerAction = (callback) => {
    setIsMobileMenuOpen(false);
    callback?.();
  };

  const drawerRowStyle = {
    width: '100%',
    minHeight: 70,
    padding: '0 2px',
    border: 'none',
    borderTop: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: bodyFont || '"Source Sans 3", "Segoe UI", sans-serif',
    fontSize: 15,
    fontWeight: 700
  };

  const drawerRows = [
    { key: 'shop', label: 'Shop', icon: ShoppingBag, onClick: onShop }
  ];
  if (typeof onTrack === 'function') {
    drawerRows.push({ key: 'track', label: 'Track Order', icon: Package, onClick: onTrack });
  }

  const textStyle = {
    border: 'none',
    background: 'transparent',
    color: '#0f172a',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: bodyFont || '"Source Sans 3", "Segoe UI", sans-serif',
    padding: '8px 0',
    lineHeight: 1
  };

  const mobileMenuButtonStyle = {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#0f172a',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 18px rgba(15,23,42,.06)',
    flexShrink: 0
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: isMobileViewport ? 0 : 6,
        border: '1px solid #e5eaf2',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
        marginBottom: 0,
        width: isMobileViewport ? '100%' : 'calc(100vw - 8px)',
        marginLeft: isMobileViewport ? 0 : 'calc(50% - 50vw + 4px)',
        overflow: 'visible'
      }}
    >
      <div
        style={{
          maxWidth: HERO_CANVAS_MAX_WIDTH,
          margin: '0 auto',
          minHeight: isMobileViewport ? 72 : 82,
          padding: isMobileViewport ? '14px 16px 10px' : '0 52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobileViewport ? 12 : 32,
          flexDirection: 'row'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 12 : 14, minWidth: 0, flex: '0 0 auto' }}>
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            style={{
              width: isMobileViewport ? 44 : 42,
              height: isMobileViewport ? 44 : 42,
              borderRadius: '50%',
              border: 'none',
              background: '#f8fafc',
              color: '#0f172a',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={isMobileViewport ? 17 : 18} strokeWidth={2.4} />
          </button>
          <a
            href={DGFY_DISCOVERY_HOME_URL}
            aria-label="Go to DGFY home"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, textDecoration: 'none' }}
          >
            <img
              src={DGFY_HEADER_LOGO_URL}
              alt="DGFY logo"
              style={{ height: isMobileViewport ? 28 : 34, width: 'auto', display: 'block' }}
            />
          </a>
        </div>

        {isMobileViewport ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexShrink: 0 }} ref={mobileMenuRef}>
            {isAuthenticated ? (
              <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label="Profile"
                  title="Profile"
                  onClick={onAccount || undefined}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: '1px solid rgba(174, 232, 244, 0.9)',
                    background: DGFY_ICE_BLUE,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: typeof onAccount === 'function' ? 'pointer' : 'default',
                    color: DGFY_DEEP_BLUE,
                    flexShrink: 0,
                    boxShadow: '0 10px 22px rgba(15, 23, 42, 0.12)',
                    fontSize: 13,
                    fontWeight: 800
                  }}
                >
                  {resolvedInitials}
                </button>
                {activeOrderCount > 0 && (
                  <span
                    aria-label={`${activeOrderCount} active order${activeOrderCount === 1 ? '' : 's'}`}
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -1,
                      minWidth: 20,
                      height: 20,
                      borderRadius: 999,
                      padding: '0 6px',
                      background: '#f97316',
                      color: '#ffffff',
                      border: '2px solid #ffffff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: 1,
                      boxShadow: '0 8px 18px rgba(249, 115, 22, 0.28)',
                      pointerEvents: 'none'
                    }}
                  >
                    {activeOrderCount > 9 ? '9+' : activeOrderCount}
                  </span>
                )}
              </div>
            ) : null}
            <button
              type="button"
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setIsMobileMenuOpen((previous) => !previous)}
              style={mobileMenuButtonStyle}
            >
              {isMobileMenuOpen ? <X size={18} strokeWidth={2.4} /> : <Menu size={18} strokeWidth={2.4} />}
            </button>
            {isMobileMenuOpen && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setIsMobileMenuOpen(false)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    border: 'none',
                    background: 'rgba(0,0,0,0.4)',
                    cursor: 'pointer'
                  }}
                />
                <aside
                  ref={mobileDrawerRef}
                  tabIndex={-1}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Mobile navigation"
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    height: '100%',
                    width: 'min(85vw, 360px)',
                    background: '#ffffff',
                    borderLeft: '1px solid #e2e8f0',
                    borderTopLeftRadius: 32,
                    borderBottomLeftRadius: 32,
                    boxShadow: '-22px 0 50px rgba(15, 23, 42, 0.18)',
                    padding: '14px 14px 16px',
                    display: 'grid',
                    gridTemplateRows: 'auto 1fr',
                    gap: 12,
                    animation: 'discoveryDrawerSlideIn 250ms ease',
                    overflowY: 'auto'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div
                      aria-label={`Current storefront: ${resolvedStorefrontName}`}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        padding: '6px 0 0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                        minWidth: 0
                      }}
                    >
                      <span
                        style={{
                          width: 58,
                          height: 58,
                          borderRadius: 999,
                          background: '#eef2f7',
                          color: DGFY_OCEAN_BLUE,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden',
                          border: '1px solid #dbe4f0'
                        }}
                      >
                        {storefrontLogoUrl ? (
                          <img
                            src={storefrontLogoUrl}
                            alt={`${resolvedStorefrontName} logo`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span style={{ fontSize: 22, fontWeight: 800 }}>{resolvedStorefrontInitial}</span>
                        )}
                      </span>
                      <span style={{ minWidth: 0, display: 'grid', gap: 3, paddingTop: 3 }}>
                        <span style={{ fontSize: 16, lineHeight: 1.2, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {resolvedStorefrontName}
                        </span>
                        <span style={{ fontSize: 13, lineHeight: 1.35, color: '#64748b', fontWeight: 600 }}>
                          {resolvedStorefrontModeLabel}
                        </span>
                        {resolvedStorefrontSlug ? (
                          <span style={{ fontSize: 11, lineHeight: 1.3, color: '#94a3b8' }}>
                            {resolvedStorefrontSlug}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="Close navigation menu"
                      onClick={() => setIsMobileMenuOpen(false)}
                      style={{
                        border: '1px solid #dbe4f0',
                        background: '#ffffff',
                        color: '#334155',
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 6px 14px rgba(15, 23, 42, 0.08)'
                      }}
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 12, minHeight: 0 }}>
                    <div style={{ display: 'grid', gap: 0, alignContent: 'start' }}>
                      {branchSelector ? (
                        <div style={{ borderTop: '1px solid #e2e8f0', padding: '14px 0 10px', display: 'grid', gap: 8 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            <MapPin size={14} />
                            <span>{hasMultipleBranches ? 'Branch' : 'Location'}</span>
                          </div>
                          <div
                            style={{
                              minWidth: 0,
                              minHeight: 52,
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            {branchSelector}
                          </div>
                        </div>
                      ) : null}
                      {drawerRows.map(({ key, label, icon: Icon, onClick }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleDrawerAction(onClick)}
                          style={drawerRowStyle}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                            <span style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: key === 'explore' ? DGFY_OCEAN_BLUE : '#64748b' }}>
                              <Icon size={19} />
                            </span>
                            <span>{label}</span>
                          </span>
                          <ChevronRight size={16} color="#64748b" />
                        </button>
                      ))}
                    </div>
                    <div />
                  </div>
                </aside>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 34,
              flexWrap: 'nowrap',
              minWidth: 0,
              whiteSpace: 'nowrap',
              marginLeft: 'auto',
              flex: '0 1 auto'
            }}
          >
            {branchSelector}
            {branchSelector && (
              <span style={{ width: 1, height: 26, background: '#d9e2ef', flexShrink: 0 }} />
            )}
            <button
              type="button"
              onClick={onShop}
              style={textStyle}
            >
              Shop
            </button>
            {onTrack && (
              <button
                type="button"
                onClick={onTrack}
                style={textStyle}
              >
                Track Order
              </button>
            )}
            <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, marginLeft: 4 }}>
              <button
                type="button"
                aria-label="Profile"
                title="Profile"
                onClick={onAccount || undefined}
                style={{
                  minHeight: 40,
                  border: 'none',
                  background: 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  cursor: typeof onAccount === 'function' ? 'pointer' : 'default',
                  color: '#0f172a',
                  flexShrink: 0,
                  transition: 'transform 0.2s, opacity 0.2s',
                  padding: isAuthenticated ? '0' : '0 4px',
                  fontFamily: bodyFont || '"Source Sans 3", "Segoe UI", sans-serif',
                  fontSize: 15,
                  fontWeight: 700
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.opacity = '0.9'; }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1'; }}
              >
                {isAuthenticated ? (
                  <>
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: DGFY_ICE_BLUE,
                        color: DGFY_DEEP_BLUE,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 800,
                        flexShrink: 0
                      }}
                    >
                      {resolvedInitials}
                    </span>
                    <span style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>{resolvedFirstName}</span>
                  </>
                ) : (
                  <User size={20} strokeWidth={2.5} />
                )}
              </button>
              {activeOrderCount > 0 && (
                <span
                  aria-label={`${activeOrderCount} active order${activeOrderCount === 1 ? '' : 's'}`}
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -1,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 999,
                    padding: '0 6px',
                    background: '#f97316',
                    color: '#ffffff',
                    border: '2px solid #ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1,
                    boxShadow: '0 8px 18px rgba(249, 115, 22, 0.28)',
                    pointerEvents: 'none'
                  }}
                >
                  {activeOrderCount > 9 ? '9+' : activeOrderCount}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StorefrontHeaderNav;

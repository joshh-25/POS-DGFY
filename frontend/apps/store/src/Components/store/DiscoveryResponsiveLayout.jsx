import React from 'react';
import { CalendarCheck2, ChevronRight, FileText, Home, Menu, User, UserCircle2, X } from 'lucide-react';

export const getDiscoveryViewportState = (viewportWidth = 1280) => {
  const width = Number(viewportWidth || 0);
  const isMobileViewport = width < 768;
  const isTabletViewport = width >= 768 && width < 1024;
  const isDesktopViewport = width >= 1024;
  const viewportMode = isMobileViewport ? 'mobile' : isTabletViewport ? 'tablet' : 'desktop';
  return {
    viewportMode,
    isMobileViewport,
    isTabletViewport,
    isDesktopViewport
  };
};

const DISCOVERY_LAYOUT_TOKENS = Object.freeze({
  mobile: {
    navOffset: 72,
    navMinHeight: 72,
    navPadding: '12px 16px',
    heroTop: 32,
    heroBottom: 18,
    heroTitleSize: 42,
    heroSubtitleSize: 15,
    heroMaxWidth: '100%',
    heroTextAlign: 'left',
    searchMaxWidth: '100%',
    searchPadding: '10px 0 12px',
    heroMapHeight: 'calc(100vh - 248px)',
    discoveryMapHeight: '40vh',
    resultsPanelWidth: '100%',
    resultsPanelMaxHeight: 'none'
  },
  tablet: {
    navOffset: 68,
    navMinHeight: 68,
    navPadding: '12px 20px',
    heroTop: 40,
    heroBottom: 18,
    heroTitleSize: 48,
    heroSubtitleSize: 16,
    heroMaxWidth: 760,
    heroTextAlign: 'center',
    searchMaxWidth: 760,
    searchPadding: '12px 0 14px',
    heroMapHeight: 'min(62vh, 620px)',
    discoveryMapHeight: 'min(58vh, 540px)',
    resultsPanelWidth: '100%',
    resultsPanelMaxHeight: 'none'
  },
  desktop: {
    navOffset: 64,
    navMinHeight: 64,
    navPadding: '14px 24px',
    heroTop: 48,
    heroBottom: 20,
    heroTitleSize: 54,
    heroSubtitleSize: 16.5,
    heroMaxWidth: 680,
    heroTextAlign: 'center',
    searchMaxWidth: 660,
    searchPadding: '12px 0 14px',
    heroMapHeight: 'calc(100vh - 224px)',
    discoveryMapHeight: 'calc(100vh - 224px)',
    resultsPanelWidth: 620,
    resultsPanelMaxHeight: 680
  }
});

export const getDiscoveryLayoutTokens = (viewportMode = 'desktop') => (
  DISCOVERY_LAYOUT_TOKENS[viewportMode] || DISCOVERY_LAYOUT_TOKENS.desktop
);

const cx = (...parts) => parts.filter(Boolean).join(' ');

const MOBILE_MENU_META = Object.freeze({
  Explore: { icon: Home, badge: null },
  Solutions: { icon: UserCircle2, badge: null },
  'About Us': { icon: FileText, badge: null },
  'Contact Us': { icon: CalendarCheck2, badge: null }
});

export function DiscoveryHeader({
  viewportMode,
  logoSrc,
  onLogoClick,
  navItems = [],
  activeItem = 'Explore',
  onProfileClick,
  profileLabel = 'Profile',
  onRegisterClick,
  menuOpen = false,
  onMenuToggle = () => {},
  onItemClick
}) {
  const isMobileViewport = viewportMode === 'mobile';
  const isTabletViewport = viewportMode === 'tablet';
  return (
    <nav className={cx('discovery-header', `discovery-header--${viewportMode}`)}>
      <div className="discovery-header__inner">
        <button type="button" onClick={onLogoClick} className="discovery-header__logoButton">
          <img src={logoSrc} alt="DGFY.ph" className="discovery-header__logo" />
        </button>

        {!isMobileViewport && (
          <div className={cx('discovery-header__nav', isTabletViewport && 'discovery-header__nav--tablet')}>
            {navItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onItemClick?.(item)}
                className={cx('discovery-header__navItem', item === activeItem && 'is-active')}
                style={{ fontFamily: '"Inter", sans-serif' }}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        <div className="discovery-header__actions">
          {isMobileViewport ? (
            <>
              {typeof onProfileClick === 'function' && (
                <button type="button" onClick={onProfileClick} className="discovery-header__profileButton" aria-label={profileLabel}>
                  <UserCircle2 size={20} />
                </button>
              )}
              <button type="button" onClick={onMenuToggle} className="discovery-header__menuButton" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}>
                {menuOpen ? <X size={22} /> : <Menu size={24} />}
              </button>
            </>
          ) : (
            <>
              {typeof onProfileClick === 'function' && (
                <button type="button" onClick={onProfileClick} className="discovery-header__secondaryAction">
                  <UserCircle2 size={isTabletViewport ? 14 : 15} />
                  {profileLabel}
                </button>
              )}
              <button type="button" onClick={onRegisterClick} className={cx('discovery-header__cta', isTabletViewport && 'discovery-header__cta--tablet')}>
                <User size={isTabletViewport ? 14 : 15} />
                Create Your Account
              </button>
            </>
          )}
        </div>
      </div>

      {isMobileViewport && menuOpen && (
        <div className="discovery-header__drawerLayer" role="presentation">
          <button
            type="button"
            className="discovery-header__drawerBackdrop"
            aria-label="Close navigation menu"
            onClick={onMenuToggle}
          />
          <aside className="discovery-header__drawerPanel" role="dialog" aria-modal="true" aria-label="Mobile navigation">
            <div className="discovery-header__drawerHeader">
              <div className="discovery-header__drawerTitle">Menu</div>
              <button
                type="button"
                className="discovery-header__drawerClose"
                onClick={onMenuToggle}
                aria-label="Close menu"
              >
                <X size={24} />
              </button>
            </div>
            <div className="discovery-header__drawerBody">
              <div className="discovery-header__menuList">
                {navItems.map((item) => {
                  const meta = MOBILE_MENU_META[item] || { icon: Home, badge: null };
                  const Icon = meta.icon;
                  const isActive = item === activeItem;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onItemClick?.(item)}
                      className={cx('discovery-header__menuItem', isActive && 'is-active')}
                      style={{ fontFamily: '"Inter", sans-serif' }}
                    >
                      <span className="discovery-header__menuItemLead">
                        <span className="discovery-header__menuItemIcon"><Icon size={17} /></span>
                        <span>{item}</span>
                      </span>
                      <span className="discovery-header__menuItemTrail">
                        {meta.badge ? <span className="discovery-header__menuItemBadge">{meta.badge}</span> : null}
                        {!isActive ? <ChevronRight size={16} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="discovery-header__drawerFooter">
                {typeof onProfileClick === 'function' && (
                  <button type="button" onClick={onProfileClick} className="discovery-header__menuSecondaryAction">
                    <UserCircle2 size={15} />
                    {profileLabel}
                  </button>
                )}
                <button type="button" onClick={onRegisterClick} className="discovery-header__menuCta">
                  <User size={15} />
                  Create Your Account
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </nav>
  );
}

export function DiscoveryHero({
  viewportMode,
  collapsed = false,
  title,
  subtitle
}) {
  return (
    <div className={cx('discovery-hero', `discovery-hero--${viewportMode}`, collapsed && 'is-collapsed')}>
      <h1 className="discovery-hero__title">{title}</h1>
      <p className="discovery-hero__subtitle">{subtitle}</p>
    </div>
  );
}

export function DiscoverySearchRegion({ viewportMode, children }) {
  return (
    <div className={cx('discovery-search-region', `discovery-search-region--${viewportMode}`)}>
      {children}
    </div>
  );
}

export function DiscoveryCategoryRail({ viewportMode, children }) {
  return (
    <div className={cx('discovery-category-rail-shell', `discovery-category-rail-shell--${viewportMode}`)}>
      {children}
    </div>
  );
}

export function DiscoveryMapCard({ viewportMode, children, className = '' }) {
  return (
    <div className={cx('discovery-map-card', `discovery-map-card--${viewportMode}`, className)}>
      {children}
    </div>
  );
}

export function DiscoveryResultsLayout({
  viewportMode,
  isPanelVisible,
  mapContent,
  panelContent
}) {
  const isDesktopViewport = viewportMode === 'desktop';
  const isTabletViewport = viewportMode === 'tablet';
  return (
    <div className={cx('discovery-results-card', `discovery-results-card--${viewportMode}`)}>
      <div className={cx('discovery-results-stage', `discovery-results-stage--${viewportMode}`)}>
        <div className="discovery-results-stage__map">
          {mapContent}
        </div>
        {(isPanelVisible || !isDesktopViewport) && (
          <aside
            className={cx(
              'discovery-results-stage__panel',
              `discovery-results-stage__panel--${viewportMode}`,
              isPanelVisible ? 'is-visible' : 'is-hidden',
              isTabletViewport && 'is-stacked'
            )}
          >
            {panelContent}
          </aside>
        )}
      </div>
    </div>
  );
}

import React from 'react';

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const SparkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
  </svg>
);

const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const renderLabel = (entry) => (typeof entry === 'string' ? entry : entry?.label || '');

export function Navbar({ navigation = {}, onNavigate, viewportKind = 'desktop' }) {
  const brandLabel = navigation.brandLabel || 'DGFY.ph';
  const brandSubtitle = navigation.brandSubtitle || 'Shared storefront template';
  const primaryLinks = Array.isArray(navigation.primaryLinks) ? navigation.primaryLinks : [];
  const utilityLinks = Array.isArray(navigation.utilityLinks) ? navigation.utilityLinks : [];
  const searchPlaceholder = navigation.searchPlaceholder || 'Search storefront sections';
  const showCompact = viewportKind !== 'desktop';

  return (
    <header className="sf-nav">
      <div className="sf-template__container">
        <div className="sf-nav__inner">
          <button type="button" className="sf-nav__brand" onClick={() => onNavigate?.('brand')}>
            <span className="sf-nav__brand-mark">{brandLabel.charAt(0)}</span>
            <span className="sf-nav__brand-copy">
              <span className="sf-nav__brand-title">{brandLabel}</span>
              <span className="sf-nav__brand-subtitle">{brandSubtitle}</span>
            </span>
          </button>

          <label className="sf-nav__search" aria-label="Template search">
            <SearchIcon />
            <input type="text" placeholder={searchPlaceholder} readOnly />
          </label>

          <div className="sf-nav__links" aria-label="Primary storefront navigation">
            {primaryLinks.map((entry) => (
              <button
                key={renderLabel(entry)}
                type="button"
                className="sf-nav__link"
                onClick={() => onNavigate?.('link', entry)}
              >
                {renderLabel(entry)}
              </button>
            ))}
          </div>

          <div className="sf-nav__utilities" aria-label="Storefront utility actions">
            {utilityLinks.map((entry, index) => (
              <button
                key={`${renderLabel(entry)}-${index}`}
                type="button"
                className={`sf-nav__utility${index === utilityLinks.length - 1 ? ' sf-nav__utility--primary' : ''}`}
                onClick={() => onNavigate?.('utility', entry)}
              >
                {index === utilityLinks.length - 1 ? <SparkIcon /> : null}
                {renderLabel(entry)}
              </button>
            ))}
          </div>

          {showCompact ? (
            <div className="sf-nav__compact-actions">
              <button type="button" className="sf-nav__icon-button" onClick={() => onNavigate?.('search')}>
                <SearchIcon />
              </button>
              <button type="button" className="sf-nav__icon-button" onClick={() => onNavigate?.('menu')}>
                <MenuIcon />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function MobileNavbar(props) {
  return <Navbar {...props} viewportKind="mobile" />;
}

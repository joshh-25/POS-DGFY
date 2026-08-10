import React from 'react';

const PinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10z" />
    <circle cx="12" cy="11" r="2.5" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const MessageIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const renderAction = (action, variant, onAction) => {
  if (!action?.label) return null;
  return (
    <button
      key={`${action.label}-${variant}`}
      type="button"
      className={`sf-button sf-button--${variant}`}
      onClick={() => onAction?.(action)}
    >
      {action.label}
    </button>
  );
};

function StoreHeroSection({ hero = {}, theme = {}, viewportKind = 'desktop', onAction }) {
  const coverImageUrl = hero.coverImageUrl || '';
  const profileImageUrl = hero.profileImageUrl || '';
  const metrics = Array.isArray(hero.metrics) ? hero.metrics : [];
  const supportItems = Array.isArray(hero.supportItems) ? hero.supportItems : [];
  const metaItems = Array.isArray(hero.metaItems) ? hero.metaItems : [];

  const heroStyle = {
    '--sf-hero-image': coverImageUrl ? `url("${coverImageUrl}")` : 'linear-gradient(135deg, rgba(15, 118, 110, 0.18), rgba(15, 23, 42, 0.12))'
  };

  return (
    <section className="sf-template__container">
      <div className="sf-template__section sf-hero" style={heroStyle}>
        <div className="sf-hero__inner">
          <div className="sf-hero__copy">
            <span className="sf-hero__eyebrow">{hero.eyebrow || 'Storefront template'}</span>
            <div className="sf-stack" style={{ gap: 12 }}>
              <h1 className="sf-hero__title" style={{ fontFamily: theme.displayFont }}>{hero.name || 'Storefront template'}</h1>
              {hero.tagline ? (
                <p className="sf-hero__tagline" style={{ fontFamily: theme.bodyFont }}>{hero.tagline}</p>
              ) : null}
              {hero.description ? (
                <p className="sf-hero__description" style={{ fontFamily: theme.bodyFont }}>{hero.description}</p>
              ) : null}
            </div>

            {metaItems.length > 0 ? (
              <div className="sf-hero__meta">
                {metaItems.map((item) => (
                  <span key={`${item.label}-${item.value}`} className="sf-chip sf-chip--dark" style={{ fontFamily: theme.bodyFont }}>
                    {item.icon === 'location' ? <PinIcon /> : item.icon === 'hours' ? <ClockIcon /> : <MessageIcon />}
                    {item.value}
                  </span>
                ))}
              </div>
            ) : null}

            {metrics.length > 0 ? (
              <div className="sf-hero__metrics">
                {metrics.map((metric) => (
                  <span key={`${metric.label}-${metric.value}`} className="sf-chip" style={{ fontFamily: theme.bodyFont }}>
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="sf-hero__actions">
              {renderAction(hero.primaryAction, 'primary', onAction)}
              {renderAction(hero.secondaryAction, 'secondary', onAction)}
              {renderAction(hero.tertiaryAction, viewportKind === 'mobile' ? 'secondary' : 'ghost', onAction)}
            </div>
          </div>

          <aside className="sf-hero__panel">
            <div className="sf-hero__profile-card">
              <div className="sf-hero__profile-row">
                {profileImageUrl ? (
                  <img src={profileImageUrl} alt={hero.name || 'Store'} className="sf-hero__profile-image" />
                ) : (
                  <div className="sf-hero__profile-fallback">{(hero.name || 'S').charAt(0)}</div>
                )}
                <div className="sf-hero__profile-copy">
                  <h2 className="sf-hero__profile-title" style={{ fontFamily: theme.displayFont }}>{hero.profileTitle || hero.name || 'Storefront'}</h2>
                  {hero.profileSubtitle ? (
                    <p className="sf-hero__profile-subtitle" style={{ fontFamily: theme.bodyFont }}>{hero.profileSubtitle}</p>
                  ) : null}
                  {hero.supportBadge ? (
                    <span className="sf-chip sf-chip--solid" style={{ width: 'fit-content', fontFamily: theme.bodyFont }}>{hero.supportBadge}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {supportItems.length > 0 ? (
              <div className="sf-hero__support">
                {supportItems.map((item) => (
                  <div key={`${item.label}-${item.value}`} className="sf-hero__support-item">
                    <span className="sf-hero__support-label" style={{ fontFamily: theme.bodyFont }}>{item.label}</span>
                    <span className="sf-hero__support-value" style={{ fontFamily: theme.bodyFont }}>{item.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}

export function StoreHeroDesktop(props) {
  return <StoreHeroSection {...props} viewportKind="desktop" />;
}

export function StoreHeroMobile(props) {
  return <StoreHeroSection {...props} viewportKind="mobile" />;
}

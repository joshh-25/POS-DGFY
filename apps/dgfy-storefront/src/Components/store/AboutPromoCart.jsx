import React from 'react';

export function AboutSection({ about = {}, theme = {} }) {
  const highlights = Array.isArray(about.highlights) ? about.highlights : [];
  const checklist = Array.isArray(about.checklist) ? about.checklist : [];

  return (
    <section className="sf-overview-card sf-stack">
      <div className="sf-section-heading">
        {about.eyebrow ? <p className="sf-section-eyebrow" style={{ fontFamily: theme.bodyFont }}>{about.eyebrow}</p> : null}
        <h2 className="sf-section-title" style={{ fontFamily: theme.displayFont }}>{about.title || 'Overview'}</h2>
        {about.description ? (
          <p className="sf-section-description" style={{ fontFamily: theme.bodyFont }}>{about.description}</p>
        ) : null}
      </div>

      {highlights.length > 0 ? (
        <div className="sf-pill-row">
          {highlights.map((highlight) => (
            <span key={highlight} className="sf-pill" style={{ fontFamily: theme.bodyFont }}>{highlight}</span>
          ))}
        </div>
      ) : null}

      {checklist.length > 0 ? (
        <ul className="sf-list">
          {checklist.map((item) => (
            <li key={item} className="sf-list__item">
              <span className="sf-list__item-marker">+</span>
              <span className="sf-section-description" style={{ fontFamily: theme.bodyFont }}>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function PromoSection({ promo = {}, theme = {} }) {
  const cards = Array.isArray(promo.cards) ? promo.cards : [];

  return (
    <section className="sf-template__container">
      <div className="sf-template__section sf-promo-card sf-stack">
        <div className="sf-section-heading">
          {promo.eyebrow ? <p className="sf-section-eyebrow" style={{ fontFamily: theme.bodyFont }}>{promo.eyebrow}</p> : null}
          <h2 className="sf-section-title" style={{ fontFamily: theme.displayFont }}>{promo.title || 'Promotions'}</h2>
          {promo.description ? (
            <p className="sf-section-description" style={{ fontFamily: theme.bodyFont }}>{promo.description}</p>
          ) : null}
        </div>

        {cards.length > 0 ? (
          <div className={`sf-card-grid${cards.length === 2 ? ' sf-card-grid--two' : ''}`}>
            {cards.map((card) => (
              <article key={`${card.title}-${card.badge || ''}`} className="sf-mode-card sf-stack" style={{ gap: 14 }}>
                {card.badge ? <span className="sf-chip sf-chip--solid" style={{ width: 'fit-content', fontFamily: theme.bodyFont }}>{card.badge}</span> : null}
                <div className="sf-stack" style={{ gap: 8 }}>
                  <h3 className="sf-section-title" style={{ fontSize: 24, fontFamily: theme.displayFont }}>{card.title}</h3>
                  {card.description ? (
                    <p className="sf-section-description" style={{ fontFamily: theme.bodyFont }}>{card.description}</p>
                  ) : null}
                </div>
                {card.meta ? <p className="sf-section-description" style={{ fontFamily: theme.bodyFont }}>{card.meta}</p> : null}
                {card.ctaLabel ? (
                  <button type="button" className="sf-button sf-button--ghost">
                    {card.ctaLabel}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="sf-section-description" style={{ fontFamily: theme.bodyFont }}>{promo.emptyLabel || 'No active promos yet.'}</p>
        )}
      </div>
    </section>
  );
}

export function CartBarDesktop({ actionRail = {}, theme = {} }) {
  if (!actionRail.title) return null;

  return (
    <div className="sf-action-rail">
      <div className="sf-template__container">
        <div className="sf-action-rail__inner">
          <div className="sf-action-rail__summary">
            {actionRail.eyebrow ? <p className="sf-action-rail__eyebrow" style={{ fontFamily: theme.bodyFont }}>{actionRail.eyebrow}</p> : null}
            <p className="sf-action-rail__title" style={{ fontFamily: theme.displayFont }}>{actionRail.title}</p>
            {actionRail.description ? (
              <p className="sf-action-rail__description" style={{ fontFamily: theme.bodyFont }}>{actionRail.description}</p>
            ) : null}
          </div>
          <div className="sf-action-rail__actions">
            {(actionRail.actions || []).map((action, index) => (
              <button key={`${action.label}-${index}`} type="button" className={`sf-button ${index === 0 ? 'sf-button--primary' : 'sf-button--secondary'}`}>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BottomActionBarMobile(props) {
  return <CartBarDesktop {...props} />;
}

import React from 'react';

export function StoreFooter({ footer = {}, theme = {} }) {
  const groups = Array.isArray(footer.groups) ? footer.groups : [];

  return (
    <footer className="sf-footer">
      <div className="sf-template__container">
        <div className="sf-footer__inner">
          <div className="sf-footer__top">
            <div className="sf-footer__brand">
              <h2 className="sf-footer__title" style={{ fontFamily: theme.displayFont }}>{footer.brandTitle || 'Storefront Template'}</h2>
              {footer.description ? (
                <p className="sf-footer__description" style={{ fontFamily: theme.bodyFont }}>{footer.description}</p>
              ) : null}
            </div>

            <div className="sf-footer__groups">
              {groups.map((group) => (
                <section key={group.title} className="sf-footer__group">
                  <h3 className="sf-footer__group-title" style={{ fontFamily: theme.bodyFont }}>{group.title}</h3>
                  <div className="sf-footer__links">
                    {(group.links || []).map((link) => (
                      <a key={`${group.title}-${link.label}`} href={link.href || '#'} className="sf-footer__link" style={{ fontFamily: theme.bodyFont }}>
                        {link.label}
                      </a>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="sf-footer__bottom">
            <p className="sf-footer__legal" style={{ fontFamily: theme.bodyFont }}>{footer.legalLine || 'Shared footer shell'}</p>
            {footer.bottomLinks?.length ? (
              <div className="sf-nav__utilities">
                {footer.bottomLinks.map((link) => (
                  <a key={link.label} href={link.href || '#'} className="sf-footer__link" style={{ fontFamily: theme.bodyFont }}>
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}

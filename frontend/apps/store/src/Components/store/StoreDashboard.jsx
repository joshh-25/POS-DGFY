import React from 'react';
import QRCode from 'qrcode';
import dgfyHeaderLogo from '../../../../../public/dgfy-logo.png';
import { ArrowLeft, Mail, MapPin, MousePointer2, Search, Share2, ShoppingBag, ShoppingCart, Sparkles, Star } from 'lucide-react';
import { getStorefrontModeAdapter } from '../../modePresentationRegistry.js';
import { useStorefrontTemplateViewport } from './useStorefrontTemplateViewport.js';
import './storefrontTemplate.css';

const renderStars = (count = 5) => (
  Array.from({ length: count }, (_, index) => (
    <span key={`star-${index}`}>*</span>
  ))
);

const buildTemplateModel = (pageModel = {}) => {
  const mode = pageModel.mode || 'services';
  const modeAdapter = getStorefrontModeAdapter({ workflow_mode: mode });
  return {
    mode,
    modeAdapter,
    navigation: pageModel.navigation || {},
    hero: pageModel.hero || {},
    overview: pageModel.overview || {},
    promo: {
      cards: Array.isArray(pageModel.promo?.cards) ? pageModel.promo.cards.filter(Boolean) : []
    },
    reviews: {
      title: pageModel.reviews?.title || 'Customer Reviews',
      subtitle: pageModel.reviews?.subtitle || 'See what customers say about this storefront',
      ctaLabel: pageModel.reviews?.ctaLabel || 'Write a Review',
      emptyState: pageModel.reviews?.emptyState || 'Customer reviews will appear here once this storefront adds review data in SKUpervisor.',
      items: Array.isArray(pageModel.reviews?.items) ? pageModel.reviews.items.filter(Boolean) : []
    },
    footer: pageModel.footer || {},
    floatingCart: pageModel.floatingCart || {}
  };
};

export function StoreDashboard({ pageModel = {}, onNavigate }) {
  const { isMobile } = useStorefrontTemplateViewport();
  const model = React.useMemo(() => buildTemplateModel(pageModel), [pageModel]);
  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState('');

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/store-template` : 'https://dgfy.ph/store-template';

  React.useEffect(() => {
    let ignore = false;
    QRCode.toDataURL(model.hero.qrValue || shareUrl, {
      margin: 0,
      width: 180,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    }).then((url) => {
      if (!ignore) setQrCodeDataUrl(url);
    }).catch(() => {
      if (!ignore) setQrCodeDataUrl('');
    });
    return () => {
      ignore = true;
    };
  }, [model.hero.qrValue, shareUrl]);

  return (
    <div className="store-template">
      <div className="store-template__section-shell">
        <div className="store-template__canvas">
          <div className="store-template__topbar">
            <div className="store-template__topbarPrimary">
              <button type="button" className="store-template__icon-circle" onClick={() => onNavigate?.('back')}>
                <ArrowLeft size={18} />
              </button>

              <button type="button" className="store-template__brand" onClick={() => onNavigate?.('brand')}>
                <img src={dgfyHeaderLogo} alt="DGFY logo" />
              </button>
            </div>

            <label className="store-template__search" aria-label="Search">
              <input type="text" placeholder={model.navigation.searchPlaceholder || 'Search Products or Services'} readOnly />
              <span className="store-template__searchAccent">
                <Search size={16} />
              </span>
            </label>

            <div className="store-template__navActions">
              <div className="store-template__branch">
                <MapPin size={16} />
                <span>Branch:</span>
                <span className="store-template__branchValue">{model.navigation.branchLabel || 'Main Branch'}</span>
              </div>
              <div className="store-template__shop">
                <ShoppingBag size={16} />
                <span>{model.navigation.shopLabel || 'Shop'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="store-template__hero">
        <div className="store-template__heroBg">
          {model.hero.coverImageUrl ? <img src={model.hero.coverImageUrl} alt="" /> : null}
          <div className="store-template__heroOverlay" />
        </div>

        <div className="store-template__heroCanvas">
          {!isMobile && (
            <div className="store-template__qrCard">
              {qrCodeDataUrl ? <img src={qrCodeDataUrl} alt="Storefront QR code" /> : null}
              <button type="button" className="store-template__shareButton" aria-label="Share storefront">
                <Share2 size={18} />
              </button>
            </div>
          )}

          <div className="store-template__heroProfile">
            {model.hero.profileImageUrl ? <img src={model.hero.profileImageUrl} alt={`${model.hero.name || 'Store'} profile`} /> : null}
          </div>

          <div className="store-template__heroContent">
            <div className="store-template__heroCopy">
              <span className="store-template__status">{model.hero.statusLabel || 'OPEN'}</span>
              <h1 className="store-template__heroTitle">{model.hero.name || 'Storefront'}</h1>
              <p className="store-template__heroTagline">{model.hero.tagline || model.modeAdapter.heroDescription}</p>
              <div className="store-template__heroMeta">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Star size={16} fill="#f59e0b" color="#f59e0b" />
                  {model.hero.ratingLabel || 'New storefront'}
                </span>
                <span className="store-template__metaDivider">|</span>
                <span>{model.hero.modeLabel || model.modeAdapter.heroEyebrow}</span>
                <span className="store-template__metaDivider">|</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={16} />
                  {model.hero.locationLabel || 'Store location'}
                </span>
              </div>
            </div>

            <div className="store-template__heroActions">
              <button type="button" className="store-template__orderButton">
                <MousePointer2 size={18} />
                {model.hero.orderLabel || model.modeAdapter.primaryActionLabel || 'Order Now'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="store-template__overviewCard">
        <div className="store-template__overviewCol store-template__overviewCol--overview">
          <h2 className="store-template__sectionLabel">Overview</h2>
          <p className="store-template__overviewText">{model.overview.aboutText || 'Business details will appear soon.'}</p>
          <button type="button" className="store-template__linkButton">See more</button>
          {Array.isArray(model.overview.galleryImages) && model.overview.galleryImages.length > 0 && (
            <div className="store-template__gallery">
              {model.overview.galleryImages.slice(0, 2).map((image, index) => (
                <div key={`gallery-${index}`} className="store-template__galleryItem">
                  <img src={image} alt="" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="store-template__overviewCol store-template__overviewCol--contact store-template__overviewCol--divided">
          <h2 className="store-template__sectionLabel">Contact &amp; Location</h2>
          <div className="store-template__contactGrid">
            <div className="store-template__contactList">
              {(model.overview.contactRows || []).map((row) => (
                <div key={`${row.label}-${row.value}`} className="store-template__contactRow">
                  <span className="store-template__contactIcon">
                    {row.label === 'Email' ? <Mail size={16} /> : <MapPin size={16} />}
                  </span>
                  <strong>{row.value}</strong>
                </div>
              ))}
              <button type="button" className="store-template__linkButton">
                {model.overview.directionsLabel || 'Get directions'}
              </button>
            </div>

            <div className="store-template__mapFrame">
              {model.overview.mapImageUrl ? <img src={model.overview.mapImageUrl} alt="Map preview" /> : null}
            </div>
          </div>
        </div>

        <div className="store-template__overviewCol store-template__overviewCol--why store-template__overviewCol--divided">
          <h2 className="store-template__sectionLabel">Why Choose Us</h2>
          <div className="store-template__whyList">
            {(model.overview.whyChooseUs || []).map((item, index) => (
              <div key={`why-${index}`} className="store-template__whyItem">
                <span className="store-template__whyIcon">
                  <Sparkles size={14} />
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {model.promo.cards.length > 0 && (
        <section className="store-template__promoSection">
          <div className="store-template__canvas">
            <div className="store-template__promoGrid">
              {model.promo.cards.map((promo, index) => (
                <article key={`promo-${index}`} className="store-template__promoCard">
                  <span className="store-template__promoBadge">{promo.badge || 'PROMO'}</span>
                  <p className="store-template__promoTitle">{promo.title || 'Promo'}</p>
                  <h3 className="store-template__promoHeadline">{promo.headline || promo.badge || 'Promo'}</h3>
                  <p className="store-template__promoText">{promo.subtitle || 'Storefront offer'}</p>
                  {promo.supportingText ? <p className="store-template__promoText">{promo.supportingText}</p> : null}
                  {promo.validityText ? <p className="store-template__promoMeta">{promo.validityText}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="store-template__reviewsSection">
        <div className="store-template__canvas">
          <div className="store-template__reviewsHeader">
            <div>
              <h2 className="store-template__reviewsTitle">{model.reviews.title}</h2>
              <p className="store-template__reviewsSubtitle">{model.reviews.subtitle}</p>
            </div>
            <button type="button" className="store-template__reviewButton">
              {model.reviews.ctaLabel}
            </button>
          </div>

          {model.reviews.items.length > 0 ? (
            <div className="store-template__reviewGrid">
              {model.reviews.items.map((review, index) => (
                <article key={`review-${index}`} className="store-template__reviewCard">
                  <p className="store-template__reviewName">{review.name || 'Customer'}</p>
                  {Number.isFinite(Number(review.rating)) && Number(review.rating) > 0 ? (
                    <div className="store-template__stars">{renderStars()}</div>
                  ) : null}
                  <p className="store-template__reviewQuote">{review.quote || ''}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="store-template__reviewEmpty">{model.reviews.emptyState}</div>
          )}
        </div>
      </section>

      <footer className="store-template__footer">
        <div className="store-template__canvas store-template__footerInner">
          <div className="store-template__footerGrid">
            <div className="store-template__footerBrand">
              <div>
                <h2 className="store-template__footerTitle">{model.footer.brandTitle || model.hero.name}</h2>
                <p className="store-template__footerDescription">{model.footer.description || model.hero.tagline}</p>
              </div>
            </div>

            <div className="store-template__footerList">
              <h3 className="store-template__footerGroupTitle">Services</h3>
              {(model.footer.serviceLinks || []).map((item) => (
                <div key={item} className="store-template__footerLink">{item}</div>
              ))}
            </div>

            <div className="store-template__footerList">
              <h3 className="store-template__footerGroupTitle">Socials</h3>
              {Array.isArray(model.footer.socialLinks) && model.footer.socialLinks.length > 0 ? (
                model.footer.socialLinks.map((item) => (
                  <a key={item.label || item} href={item.href || '#'} className="store-template__footerLink">
                    {item.label || item}
                  </a>
                ))
              ) : (
                <div className="store-template__footerLink">No social links yet.</div>
              )}
            </div>

            <div className="store-template__footerList">
              <h3 className="store-template__footerGroupTitle">Contact</h3>
              {(model.footer.contactLines || []).map((item) => (
                <div key={item} className="store-template__footerLink">{item}</div>
              ))}
            </div>
          </div>

          <div className="store-template__footerBottom">
            <div className="store-template__footerCopy">{model.footer.legalLine || model.hero.name}</div>
            <div className="store-template__footerCopy">{model.footer.poweredBy || 'Powered by SKUpervisor'}</div>
          </div>
        </div>
      </footer>

      <button type="button" className="store-template__floatingCart" aria-label="Cart preview">
        <ShoppingCart size={30} />
        <span className="store-template__floatingCartCount">{model.floatingCart.count ?? 0}</span>
      </button>
    </div>
  );
}

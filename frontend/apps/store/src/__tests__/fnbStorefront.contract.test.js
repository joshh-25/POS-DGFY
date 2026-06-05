import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = () => fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');
const panelSource = () => fs.readFileSync(path.join(appRoot, 'FnbReservationPanel.jsx'), 'utf8');
const promoSource = () => fs.readFileSync(path.join(appRoot, 'components/storefront/sections/StorefrontPromoSection.jsx'), 'utf8');
const reviewsSource = () => fs.readFileSync(path.join(appRoot, 'components/storefront/sections/StorefrontReviewsSection.jsx'), 'utf8');

describe('Food & Beverage storefront contract', () => {
  it('renders restaurant menu metadata and carries modifiers into checkout lines', () => {
    const source = appSource();

    expect(source).toContain('fnb_modifier_groups');
    expect(source).toContain('Allergens:');
    expect(source).toContain('getDefaultFnbLineModifiers');
    expect(source).toContain('line_modifiers');
  });

  it('supports a deep-linkable item detail subpage for food and beverage menus', () => {
    const source = appSource();

    expect(source).toContain("const STORE_ITEM_SUBPAGE = 'item';");
    expect(source).toContain('?item=');
    expect(source).toContain('review_token');
    expect(source).toContain('<FnbProductDetailsPage');
    expect(source).toContain('const openFnbDetail = (item, options = {}) => {');
    expect(source).toContain('const closeFnbDetail = () => {');
    expect(source).toContain('isFnbDetailsSubpage');
  });

  it('adds item-level reviews to the F&B detail experience without redesigning the page shell', () => {
    const source = appSource();

    expect(source).toContain('/api/v1/dgfy/customer/reviews/public?');
    expect(source).toContain('/api/v1/dgfy/customer/review-invites/');
    expect(source).toContain('openFnbItemReviewFromInvite');
    expect(source).toContain('review_invites');
  });

  it('keeps the mobile F&B metadata row data-driven from storefront and follow state', () => {
    const source = appSource();

    expect(source).toContain('followersLabel');
    expect(source).toContain('heroSectionModel.modeLabel');
    expect(source).toContain('heroSectionModel.locationLabel');
    expect(source).not.toContain("heroSectionModel.modeLabel || 'Food and beverages'");
    expect(source).toContain('mobileHeroMetaItems');
    expect(source).toContain("flexWrap: 'nowrap'");
    expect(source).toContain("overflowX: 'auto'");
    expect(source).not.toContain("heroSectionModel.ratingLabel || 'Fresh menu'");
    expect(source).not.toContain("aboutText || 'This menu storefront is connected to live SKUpervisor product data and the food and beverage backend.'");
    expect(source).not.toContain("heroSectionModel.hours || 'Mon-Sat 9:00 AM - 6:00 PM'");
  });

  it('keeps the new mobile F&B CTAs and category controls functional without reverting the layout', () => {
    const source = appSource();

    expect(source).toContain('heroSectionModel.actions?.canMessage');
    expect(source).toContain('heroSectionModel.actions.messageHref');
    expect(source).toContain('heroSectionModel.actions?.canCall');
    expect(source).toContain('heroSectionModel.actions.callHref');
    expect(source).toContain("section.items?.length || 0");
    expect(source).toContain("onClick={() => setActiveServiceTab('')}");
    expect(source).toContain("placeholder=\"Search meals, drinks, desserts...\"");
  });

  it('collapses About Us and Gallery sections when IMS content is empty', () => {
    const source = appSource();

    expect(source).toContain('const hasAboutSection = aboutText.length > 0;');
    expect(source).toContain('const hasGallerySection = galleryImages.length > 0;');
    expect(source).toContain('const hasAboutOrGallerySection = hasAboutSection || hasGallerySection;');
    expect(source).toContain('const hasMobileStoreDetailsSummary = Boolean(displayHours) || deliveryPlatformLinks.length > 0;');
    expect(source).toContain("const showMobilePrimaryInfoCard = hasAboutSection || hasMobileStoreDetailsSummary;");
    expect(source).toContain("{hasAboutSection ? 'About Us' : 'Store Details'}");
    expect(source).toContain('sectionAboutText: heroSectionModel?.aboutText ||');
    expect(source).toContain('{hasAboutOrGallerySection && (');
    expect(source).toContain('{hasAboutSection && (');
  });

  it('prefers live storefront hours data over stale display fallbacks', () => {
    const source = appSource();

    expect(source).toContain('formatStorefrontBusinessHoursDisplay(rawValue)');
    expect(source).toContain('|| rawValue');
    expect(source).toContain('|| fallbackDisplay');
  });

  it('keeps mobile section wrappers aligned to the content width system', () => {
    const promo = promoSource();
    const reviews = reviewsSource();
    const app = appSource();

    expect(promo).toContain("marginLeft: isMobileViewport ? 0 : 'calc(50% - 50vw)'");
    expect(promo).toContain("width: isMobileViewport ? '100%' : '100vw'");
    expect(reviews).toContain("marginLeft: isMobileViewport ? 0 : 'calc(50% - 50vw)'");
    expect(reviews).toContain("width: isMobileViewport ? '100%' : '100vw'");
    expect(app).toContain("const mobileInfoCardWidth = 'calc(100% - 32px)'");
    expect(app).toContain("scrollPaddingInline: 16");
    expect(app).toContain("overflowY: 'hidden'");
    expect(app).toContain("overscrollBehaviorX: 'contain'");
    expect(app).toContain("paddingRight: 4");
    expect(app).toContain('const FNB_MOBILE_FLOATING_CART_TRAILING_GUTTER = 84;');
    expect(app).toContain("const fnbMobileCatalogInlinePadding = isMobileViewport ? '0 16px' : '0 24px';");
    expect(app).toContain("const fnbMobileMenuInnerWidth = isMobileViewport ? 'calc(100% - 8px)' : '100%';");
    expect(app).toContain("width: '100%'");
    expect(app).toContain("width: fnbMobileMenuInnerWidth");
    expect(app).toContain('flexShrink: 0');
    expect(app).toContain("flex: '1 1 auto'");
    expect(app).toContain("width: 'auto'");
    expect(app).toContain("width: 'calc(100% - 8px)'");
    expect(promo).toContain('mobileTrailingInset = 0');
    expect(reviews).toContain('mobileTrailingInset = 0');
    expect(promo).toContain('const mobileContentPaddingRight = 16 + mobileTrailingSpace;');
    expect(reviews).toContain('const mobileContentPaddingRight = 16 + mobileTrailingSpace;');
    expect(promo).toContain('paddingRight: isMobileViewport ? mobileContentPaddingRight : 24');
    expect(reviews).toContain('paddingRight: isMobileViewport ? mobileContentPaddingRight : 24');
    expect(promo).toContain("width: '100%'");
    expect(reviews).toContain("width: '100%'");
    expect(app).toContain('fullBleed && !isMobileViewport');
    expect(app).toContain('isMobileViewport={isMobileViewport}');
  });

  it('exposes the public reservation request tab for F&B storefronts', () => {
    const source = appSource();
    const panel = panelSource();

    expect(source).toContain("id: 'reservation'");
    expect(source).toContain('/api/v1/store/fnb/reservations');
    expect(panel).toContain('Reservation Request');
    expect(panel).toContain('Send Request');
  });
});

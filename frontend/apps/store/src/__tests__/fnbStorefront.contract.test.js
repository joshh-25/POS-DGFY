import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = () => fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');
const panelSource = () => fs.readFileSync(path.join(appRoot, 'FnbReservationPanel.jsx'), 'utf8');
const productDetailsSource = () => fs.readFileSync(path.join(appRoot, 'Components/storefront/pages/FnbProductDetailsPage.jsx'), 'utf8');
const accountPageSource = () => fs.readFileSync(path.join(appRoot, 'Components/storefront/pages/DgfyCustomerAccountPage.jsx'), 'utf8');
const solutionsPageSource = () => fs.readFileSync(path.join(appRoot, 'Components/storefront/pages/SolutionsPage.jsx'), 'utf8');
const businessRegistrationUrlSource = () => fs.readFileSync(path.join(appRoot, 'businessRegistrationUrl.js'), 'utf8');

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
    expect(productDetailsSource()).toContain('image_gallery');
    expect(productDetailsSource()).toContain("aria-roledescription={hasMultipleImages ? 'carousel' : undefined}");
    expect(productDetailsSource()).toContain('handleCarouselTouchStart');
    expect(productDetailsSource()).toContain('handleCarouselTouchEnd');
    expect(productDetailsSource()).toContain('aria-label="Previous product image"');
    expect(productDetailsSource()).toContain('aria-label="Next product image"');
    expect(productDetailsSource()).toContain('carousel-dot');
    expect(source).toContain('const openFnbDetail = useCallback((item, options = {}) => {');
    expect(source).toContain('const closeFnbDetail = () => {');
    expect(source).toContain('isFnbDetailsSubpage');
  });

  it('keeps DGFY account and checkout contracts wired through Storefront account routes', () => {
    const source = appSource();
    const accountSource = accountPageSource();

    expect(source).toContain('const readStorefrontCustomerAuthToken = () => readDgfyAuthToken() || readStoreAuthToken();');
    expect(source).toContain('authToken: readStorefrontCustomerAuthToken()');
    expect(source).toContain('onCancelOrder={handleCancelAccountOrder}');
    expect(source).toContain('onReorderOrder={handleReorderAccountOrder}');
    expect(source).toContain('const [pendingAccountReorder, setPendingAccountReorder]');
    expect(source).toContain('buildAccountReorderCartLines');
    expect(source).toContain('getUnavailableReorderLineNames');
    expect(source).not.toContain('isAccountDrawerOpen && (isGuestAccountDrawerState ?');
    expect(accountSource).toContain('allowed_actions');
    expect(accountSource).toContain('onCancelOrder?.(order)');
    expect(accountSource).toContain('pendingCancelOrder');
    expect(accountSource).toContain('Confirm Cancel');
    expect(accountSource).toContain('onReorderOrder?.(order)');
    expect(accountSource).toContain('onSaveAddress');
    expect(accountSource).toContain('onDeleteAddress');
    expect(accountSource).toContain('onSetDefaultAddress');
    expect(accountSource).toContain('renderAddressPinEditor');
    expect(accountSource).toContain('latitude');
    expect(accountSource).toContain('longitude');
    expect(accountSource).toContain('Pinned at');
    expect(accountSource).toContain('Add Location');
    expect(accountSource).toContain('Saved Locations');
    expect(source).toContain('const renderAddressPinEditor = useCallback');
    expect(source).toContain('Use Current Location');
    expect(source).toContain('Saved Delivery Locations');
    expect(source).toContain('Saved Service Locations');
    expect(source).toContain('text_only');
    expect(source).toContain('String(previous?.address_line || \'\').trim() || resolvedAddress');
    expect(source).toContain('String(previous || \'\').trim() ? previous : formattedAddress');
    expect(source).toContain('latitude: coordinates?.latitude ?? null');
    expect(source).toContain('longitude: coordinates?.longitude ?? null');
    expect(source).toContain('/api/v1/dgfy/customer/addresses');
    expect(source).toContain('deliverySavedLocations');
    expect(source).toContain('applySavedDeliveryLocation');
    expect(source).toContain('sourceType: \'account_saved\'');
    expect(source).toContain('sourceType: \'checkout_temporary\'');
    expect(source).toContain('sourceType: \'recommended_store_or_branch\'');
  });

  it('builds business registration links through the configurable Storefront helper', () => {
    const source = appSource();
    const solutionsSource = solutionsPageSource();
    const helperSource = businessRegistrationUrlSource();

    expect(source).toContain('buildBusinessRegistrationUrl');
    expect(solutionsSource).toContain("import { buildBusinessLoginUrl, buildBusinessRegistrationUrl } from '../../../businessRegistrationUrl.js';");
    expect(helperSource).toContain('VITE_SKUPERVISOR_REGISTRATION_URL');
    expect(helperSource).toContain('https://skupervisor.dgfy.ph/register-company');
    expect(source).not.toContain("new URL('https://skupervisor.dgfy.ph/register-company')");
    expect(solutionsSource).not.toContain("window.location.href = 'https://skupervisor.dgfy.ph/register-company'");
  });

  it('adds item-level reviews to the F&B detail experience without redesigning the page shell', () => {
    const source = appSource();

    expect(source).toContain('/api/v1/dgfy/customer/reviews/public?');
    expect(source).toContain('/api/v1/dgfy/customer/review-invites/');
    expect(source).toContain('openFnbItemReviewFromInvite');
    expect(source).toContain('review_invites');
  });

  it('exposes the public reservation request tab for F&B storefronts', () => {
    const source = appSource();
    const panel = panelSource();

    expect(source).toContain("id: 'reservation'");
    expect(source).toContain('/api/v1/store/fnb/reservations');
    expect(panel).toContain('Reservation Request');
    expect(panel).toContain('Send Request');
  });

  it('renders derived F&B menu content when storefront profile fields are thin', () => {
    const source = appSource();

    expect(source).toContain('buildFnbContentReadinessItems');
    expect(source).toContain('Menu at a glance');
    expect(source).toContain('menu items published');
    expect(source).toContain('items marked ready now');
    expect(source).toContain('Store profile copy is available');
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = () => fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');
const sourceWithoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const appImplementationSource = () => sourceWithoutComments(appSource());
const panelSource = () => fs.readFileSync(path.join(appRoot, 'FnbReservationPanel.jsx'), 'utf8');
const productDetailsSource = () => fs.readFileSync(path.join(appRoot, 'Components/storefront/pages/FnbProductDetailsPage.jsx'), 'utf8');
const accountPageSource = () => fs.readFileSync(path.join(appRoot, 'Components/storefront/pages/DgfyCustomerAccountPage.jsx'), 'utf8');
const solutionsPageSource = () => fs.readFileSync(path.join(appRoot, 'Components/storefront/pages/SolutionsPage.jsx'), 'utf8');
const businessRegistrationUrlSource = () => fs.readFileSync(path.join(appRoot, 'businessRegistrationUrl.js'), 'utf8');

describe('Food & Beverage storefront contract', () => {
  it('renders restaurant menu metadata and carries modifiers into checkout lines', () => {
    const source = appImplementationSource();

    expect(source).toContain('fnb_modifier_groups');
    expect(source).toContain('line_modifiers');
    expect(source).toContain('selectedFnbLineModifiers');
    expect(source).toContain('setSelectedFnbLineModifiers');
    expect(productDetailsSource()).toContain('Allergens');
  });

  it('supports a deep-linkable item detail subpage for food and beverage menus', () => {
    const source = appImplementationSource();

    expect(source).toContain("const STORE_ITEM_SUBPAGE = 'item';");
    expect(source).toContain('?item=');
    expect(source).toContain('review_token');
    expect(source).toContain('<FnbProductDetailsPage');
    expect(productDetailsSource()).toContain('aria-label="View larger image"');
    expect(productDetailsSource()).toContain('aria-label="Previous slide"');
    expect(productDetailsSource()).toContain('aria-label="Next slide"');
    expect(productDetailsSource()).toContain('Custom dynamic thumbnails gallery representation');
    expect(source).toContain('const openFnbDetail = useCallback((item, options = {}) => {');
    expect(source).toContain('const closeFnbDetail = () => {');
    expect(source).toContain('isFnbDetailsSubpage');
  });

  it('keeps DGFY account and checkout contracts wired through Storefront account routes', () => {
    const source = appImplementationSource();
    const accountSource = accountPageSource();

    expect(source).toContain('openBusinessRegistrationFlow');
    expect(source).toContain('requestDgfyBusinessSecurityCode');
    expect(source).toContain('trackedCustomerActivity');
    expect(accountSource).toContain('Registered Businesses');
    expect(accountSource).toContain('Go to Inventory');
    expect(accountSource).toContain('businessMemberships');
    expect(accountSource).toContain('onOpenBusinessInventory');
    expect(source).toContain('Use Current Location');
    expect(source).toContain('deliverySavedLocations');
    expect(source).toContain('applySavedDeliveryLocation');
    expect(source).toContain('customerPin');
    expect(source).toContain('selectedSavedLocationId');
  });

  it('builds business registration links through the configurable Storefront helper', () => {
    const source = appImplementationSource();
    const solutionsSource = solutionsPageSource();
    const helperSource = businessRegistrationUrlSource();

    expect(source).toContain('buildBusinessRegistrationUrl');
    expect(solutionsSource).toContain("import { buildBusinessLoginUrl, buildBusinessRegistrationUrl } from '../../../businessRegistrationUrl.js';");
    expect(helperSource).toContain('VITE_SKUPERVISOR_REGISTRATION_URL');
    expect(helperSource).toContain('https://skupervisor.dgfy.ph/register-company');
    expect(source).not.toContain("new URL('https://skupervisor.dgfy.ph/register-company')");
    expect(solutionsSource).not.toContain("window.location.href = 'https://skupervisor.dgfy.ph/register-company'");
  });

  it('keeps checkout identity, handoff, saved details, and payment session paths in production code', () => {
    const source = appImplementationSource();

    expect(source).toContain('readStorefrontCustomerAuthToken');
    expect(source).toContain('readDgfyHandoffToken');
    expect(source).toContain('/api/v1/dgfy/auth/handoff/exchange');
    expect(source).toContain('writeDgfyAuthToken(token)');
    expect(source).toContain('DgfyCustomerAuthModal');
    expect(source).toContain('readSavedCustomerDetails');
    expect(source).toContain('writeSavedCustomerDetails');
    expect(source).toContain('clearSavedCustomerDetailsForDevice');
    expect(source).toContain('rememberCustomerDetails');
    expect(source).toContain('/api/v1/store/checkout/payment-sessions');
    expect(source).toContain("source: authToken ? 'account' : 'guest'");
    expect(source).toContain('setIsGuestTrackingDrawerOpen(true)');
    expect(source).toContain('Active guest orders for this store only.');
  });

  it('adds item-level reviews to the F&B detail experience without redesigning the page shell', () => {
    const source = appImplementationSource();

    expect(source).toContain('/api/v1/dgfy/customer/reviews/public?');
    expect(source).toContain('/api/v1/dgfy/customer/review-invites/');
    expect(source).toContain('openFnbItemReviewFromInvite');
    expect(source).toContain('review_invites');
  });

  it('exposes the public reservation request tab for F&B storefronts', () => {
    const panel = panelSource();

    expect(panel).toContain('Reservation Request');
    expect(panel).toContain('Send Request');
  });

  it('starts a fresh F&B order after a completed checkout/back navigation', () => {
    const source = appImplementationSource();

    expect(source).toContain('setCheckoutResult(null);');
    expect(source).toContain('setFnbOrderStep(3);');
    expect(source).toContain("setCheckoutTab(isFnbMode ? 'cart' : 'review');");
    expect(source).toContain('setSimpleOrderStep(1)');
    expect(source).toContain('Back to Menu');
  });

  it('renders derived F&B menu content when storefront profile fields are thin', () => {
    const source = appImplementationSource();

    expect(source).not.toContain('buildFnbContentReadinessItems');
    expect(source).not.toContain('buildFnbOverviewFallbackCopy');
    expect(source).not.toContain('Menu at a glance');
    expect(source).not.toContain('published menu item');
    expect(source).not.toContain('menu items published');
    expect(source).not.toContain('items marked ready now');
    expect(source).not.toContain('Store profile copy is available');
    expect(source).not.toContain('food and beverage backend');
  });
});

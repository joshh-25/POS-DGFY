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
    expect(productDetailsSource()).toContain('aria-label="View larger image"');
    expect(productDetailsSource()).toContain('aria-label="Previous slide"');
    expect(productDetailsSource()).toContain('aria-label="Next slide"');
    expect(productDetailsSource()).toContain('Custom dynamic thumbnails gallery representation');
    expect(source).toContain('const openFnbDetail = (item, options = {}) => {');
    expect(source).toContain('const closeFnbDetail = () => {');
    expect(source).toContain('isFnbDetailsSubpage');
  });

  it('keeps DGFY account and checkout contracts wired through Storefront account routes', () => {
    const source = appSource();
    const accountSource = accountPageSource();

    expect(source).toContain('handleOpenBusinessInventory');
    expect(source).toContain('trackedCustomerActivity');
    expect(accountSource).toContain('Your businesses');
    expect(accountSource).toContain('Pending invitations');
    expect(accountSource).toContain("startBusinessAction('accept'");
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

  it('supports guest-or-account checkout entry while preserving auth draft resume state', () => {
    const source = appSource();

    expect(source).toContain('STOREFRONT_CHECKOUT_AUTH_RESUME_KEY');
    expect(source).toContain('writeCheckoutAuthResumeDraft');
    expect(source).toContain('clearCheckoutAuthResumeDraft');
    expect(source).toContain('renderGuestCheckoutEntry');
    expect(source).toContain('renderAccountOwnedIdentitySummary');
    expect(source).toContain('Create DGFY Account');
    expect(source).toContain('Continue as Guest');
    expect(source).toContain('Already have an account?');
    expect(source).toContain('customerFirstName');
    expect(source).toContain('customerLastName');
    expect(source).toContain('buildCustomerFullName');
    expect(source).toContain("toast.success('Signed in. Resuming your checkout.')");
    expect(source).toContain("description: 'Create an account or continue as guest to continue this menu order.'");
    expect(source).toContain("description: hasServiceCart");
    expect(source).toContain("const nextFnbStep = draft.checkoutTab === 'cart' ? 3 : null;");
    expect(source).toContain("const nextSimpleStep = draft.checkoutTab === 'checkout' && !draft.selectedServiceItemId ? 1 : null;");
    expect(source).toContain("const nextServiceStep = draft.selectedServiceItemId ? 1 : null;");
    expect(source).toContain('setGuestCheckoutUnlocked(true)');
    expect(source).toContain("Your DGFY account details will be used for this order.");
    expect(source).toContain("Your signed-in DGFY account will be used for this booking.");
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

  it('does not depend on generated F&B summary copy when IMS profile fields are thin', () => {
    const source = appSource();

    expect(source).not.toContain('buildFnbContentReadinessItems');
    expect(source).not.toContain('buildFnbOverviewFallbackCopy');
    expect(source).not.toContain('Menu at a glance');
    expect(source).not.toContain('published menu item');
    expect(source).not.toContain('menu items published');
    expect(source).not.toContain('items marked ready now');
    expect(source).not.toContain('Store profile copy is available');
    expect(source).not.toContain('food and beverage backend');
  });

  it('starts a fresh F&B order after a completed checkout/back navigation', () => {
    const source = appSource();

    expect(source).toContain('setCheckoutResult(null);');
    expect(source).toContain('setFnbOrderStep(3);');
    expect(source).toContain("setCheckoutTab(isFnbMode ? 'cart' : 'review');");
    expect(source).toContain('setSimpleOrderStep(1)');
    expect(source).toContain('Back to Menu');
  });
});

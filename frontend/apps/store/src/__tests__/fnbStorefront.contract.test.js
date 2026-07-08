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
const guestTrackingDrawerSource = () => fs.readFileSync(path.join(appRoot, 'tracking/components/GuestTrackingDrawer.jsx'), 'utf8');
const serviceBookingStepsSource = () => fs.readFileSync(path.join(appRoot, 'services/components/ServiceBookingSteps.jsx'), 'utf8');

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

  it('shows logged-in customer saved addresses in simple delivery checkout before map pinning', () => {
    const source = appSource();

    expect(source).toContain('Saved Addresses');
    expect(source).toContain('Choose a saved address from your DGFY account or enter a new one below.');
    expect(source).toContain('accountSavedDeliveryLocations.length > 0');
    expect(source).toContain("key={`simple-delivery-location-${location.id}`}");
    expect(source).toContain('applySavedDeliveryLocation(location)');
    expect(source).toContain('handleSetDefaultDeliveryAddress(location)');
    expect(source).toContain('handleRemoveDeliveryAddress(location)');
    expect(source).toContain('Delivery Address *');
    expect(source).toContain('No saved addresses yet. Add or pin a new one.');
  });

  it('hydrates account checkout state for cookie-backed DGFY sessions, not token-only sessions', () => {
    const source = appSource();

    expect(source).toContain('if (!isDgfyCustomerSignedIn || accountPanel.loading) return;');
    expect(source).not.toContain('if (!dgfyAuthToken || accountPanel.loading) return;');
  });

  it('keeps mobile delivery maps on a concrete height with DGFY-branded expanded state', () => {
    const source = appSource();

    expect(source).toContain('const resolvedHeight = typeof height ===');
    expect(source).toContain('height: resolvedHeight');
    expect(source).toContain('data-delivery-map-frame="true"');
    expect(source).toContain('data-delivery-map-root="true"');
    expect(source).toContain('data-delivery-map-controls="true"');
    expect(source).toContain('ResizeObserver');
    expect(source).toContain('window.visualViewport?.addEventListener?.(\'resize\'');
    expect(source).toContain('scheduleMapResize(\'observer\')');
    expect(source).toContain('scheduleMapResize(\'viewport\')');
    expect(source).toContain("height={isMobileViewport ? 'clamp(230px, 34svh, 280px)' : 260}");
    expect(source).not.toContain("aspectRatio: '16 / 10'");
    expect(source).toContain("height={isMobileViewport ? 'clamp(340px, min(70svh, calc(100svh - 220px)), 620px)' : 520}");
    expect(source).toContain('highlightColor={fnbOrderBrand}');
    expect(source).toContain('highlightGlow="rgba(26,78,141,0.16)"');
    expect(source).toContain("maxWidth: isMobileViewport ? 'calc(100% - 68px)' : 'none'");
    expect(source).toContain("pointerEvents: 'none'");
    expect(source).toContain("pointerEvents: 'auto'");
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

  it('uses the side tracking drawer instead of the deprecated standalone tracking list card', () => {
    const source = appSource();
    const drawerSource = guestTrackingDrawerSource();

    expect(source).toContain('const isStandaloneTrackingPage = Boolean(trackingResult)');
    expect(source).toContain("const preferredTab = pendingOrderInitialTab || (routeWantsTrack ? 'track' : 'checkout');");
    expect(source).toContain('setIsGuestTrackingDrawerOpen(true);');
    expect(source).toContain('trackingError={trackingError}');
    expect(source).not.toContain('In-progress orders are tracked automatically on this device.');
    expect(source).not.toContain("key={`guest-track-order-${entry.tracking_pin}`}");
    expect(drawerSource).toContain('Active orders linked to your DGFY account.');
    expect(drawerSource).toContain('trackingError =');
  });

  it('keeps /track routes mode-independent and limiter-safe', () => {
    const source = appSource();

    expect(source).toContain('const isStoreTrackingRoute = isTrackSubpage || currentPathSubpage === STORE_TRACK_SUBPAGE;');
    expect(source).toContain('const isFnbOrderSubpage = isFnbMode && isResolvedOrderSubpage;');
    expect(source).toContain("const isStandaloneTrackingPage = Boolean(trackingResult) && isResolvedOrderSubpage && checkoutTab === 'track';");
    expect(source).toContain('const shouldInitializeTrackingRoute = isFnbOrderSubpage || routeWantsTrack;');
    expect(source).not.toContain('if (!isFnbOrderSubpage) return;');
    expect(source).toContain("const shouldPollTrackingRoute = checkoutTab === 'track' && (isFnbOrderSubpage || isStoreTrackingRoute);");
    expect(source).toContain('return buildTrackingPinKey(guestTrackedOrders, {');
    expect(source).toContain('enabled: !isStoreTrackingRoute');
    expect(source).toContain("guestTrackingBackgroundPinsKey.split('|').filter(Boolean)");
    expect(source).toContain('createCompletionTrackingScheduler({');
    expect(source).toContain('resolveTrackingRetryDelayMs({ error, normalDelayMs })');
    expect(source).toContain("visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'visible'");
    expect(source).not.toContain('window.setInterval(refreshSelectedPin');
    expect(source).not.toContain('guestTrackedOrders, isFnbOrderSubpage');
    expect(source).not.toContain('trackingResult?.status]);');
    expect(source).toContain('300000 : 180000');
    expect(source).toContain('Tracking is refreshing too often');
    expect(source).toContain("Try again in ${trackingCooldownLabel}");
    expect(source).toContain('disabled={isTrackingRefreshing || isTrackingCooldownActive}');
    expect(source).toContain('setIsGuestTrackingDrawerOpen(false);');
  });

  it('keeps signed-in standalone tracking live through SSE with polling repair', () => {
    const source = appSource();

    expect(source).toContain('const hasVisibleCustomerTrackingSurface = isAccountDrawerOpen');
    expect(source).toContain('|| isStandaloneTrackingPage');
    expect(source.match(/if \(!hasVisibleCustomerTrackingSurface\) return undefined;/g)).toHaveLength(2);
    expect(source).toContain("source.addEventListener('activity.updated'");
    expect(source).toContain('mergeLiveAccountActivity(payload.activity);');
    expect(source).toContain('source.onerror = () => {');
    expect(source).toContain('void handleLoadAccountPanel();');
    expect(source).toContain('dedupeActiveCustomerOrders(accountPanel.orders)');
    expect(source).toContain('mergeVisibleTrackingResult(previous, activity)');
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
    expect(serviceBookingStepsSource()).toContain("Your signed-in DGFY account will be used for this booking.");
    expect(source).toContain("simpleOrderStep === 1");
    expect(source).toContain("serviceBookingStep === 1");
    expect(source).toContain("renderGuestCheckoutEntry({");
    expect(source).toContain("description: 'Create an account or continue as guest to continue this order.'");
    expect(source).toContain("description: hasServiceCart");
    expect(serviceBookingStepsSource()).toContain('Use guest booking now, or create a DGFY account later with these same details.');
  });

  it('keeps F&B checkout payment values backend-valid and excludes the old online placeholder', () => {
    const source = appSource();

    expect(source).toContain('STOREFRONT_CHECKOUT_PAYMENT_OPTIONS');
    expect(source).toContain("{ value: 'cash', label: 'Cash on delivery/pickup' }");
    expect(source).toContain("{ value: 'gcash', label: 'GCash' }");
    expect(source).toContain("{ value: 'maya', label: 'Maya' }");
    expect(source).toContain("{ value: 'card', label: 'Card' }");
    expect(source).toContain("{ value: 'bank_transfer', label: 'Bank transfer' }");
    expect(source).not.toContain("{ value: 'online', label: 'Online payment' }");
    expect(source).toContain('payment_type: fnbPaymentType');
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

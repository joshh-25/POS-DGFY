import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

const appSource = () => readSource('StorefrontApp.jsx');
const routingSource = () => readSource('app/routing/storefrontRouting.js');
const navigationSource = () => readSource('app/routing/storefrontNavigation.js');
const storefrontAppSource = () => readSource('StorefrontApp.jsx');
const productDetailsRouteSource = () => readSource('modes/fnb/storefront/pages/FnbProductDetailsRoute.jsx');
const productDetailsPageSource = () => readSource('modes/fnb/storefront/pages/FnbProductDetailsPage.jsx');
const catalogRouteContainerSource = () => readSource('app/pages/StorefrontCatalogRouteContainer.jsx');
const productDetailsMediaSource = () => readSource('modes/fnb/storefront/components/FnbProductMediaGallery.jsx');
const productDetailsNutritionSource = () => readSource('modes/fnb/storefront/components/FnbProductNutritionAllergens.jsx');
const productDetailsReviewsSource = () => readSource('modes/fnb/storefront/components/FnbProductReviewsSection.jsx');
const productDetailsRoutePropsSource = () => readSource('modes/fnb/storefront/hooks/useFnbProductDetailsRouteProps.js');
const productDetailActionsSource = () => readSource('modes/fnb/storefront/hooks/useFnbProductDetailActions.js');
const productCardSource = () => readSource('modes/fnb/storefront/components/FnbProductCard.jsx');
const cartMutationsHookSource = () => readSource('shared/hooks/useCartMutations.js');
const checkoutSubmissionHookSource = () => readSource('shared/hooks/useCheckoutSubmission.js');
const catalogRuntimeSource = () => readSource('modes/fnb/storefront/hooks/useFnbCatalogRuntime.js');
const storefrontCatalogHookSource = () => readSource('shared/hooks/useStorefrontCatalog.js');
const itemReviewRuntimeSource = () => readSource('modes/fnb/storefront/hooks/useFnbItemReviewRuntime.js');
const checkoutPayloadSource = () => readSource('modes/fnb/checkout/model/buildFnbCheckoutPayload.js');
const checkoutPaymentOptionsSource = () => readSource('modes/fnb/checkout/model/fnbCheckoutPaymentOptions.js');
const checkoutRouteMountSource = () => readSource('modes/fnb/checkout/pages/FnbCheckoutRouteMount.jsx');
const checkoutRouteContainerSource = () => readSource('modes/fnb/checkout/pages/FnbCheckoutRouteContainer.jsx');
const cartDrawerShellContainerSource = () => readSource('app/pages/StorefrontCartDrawerShellContainer.jsx');
const checkoutSubmissionSource = () => readSource('modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js');
const signedInCheckoutAddressesSource = () => readSource('modes/fnb/checkout/hooks/useSignedInCheckoutAddresses.js');
const fnbTrackingContainerSource = () => readSource('modes/fnb/tracking/pages/FnbTrackingRouteContainer.jsx');
const fnbTrackingAdapterSource = () => readSource('modes/fnb/tracking/model/fnbTrackingAdapter.js');
const fnbTrackingPayloadSource = () => readSource('modes/fnb/tracking/model/fnbTrackingPayload.js');
const fnbTrackingDrawerTotalsSource = () => readSource('modes/fnb/tracking/components/FnbTrackingDrawerTotals.jsx');
const fnbTrackingActiveViewSource = () => readSource('modes/fnb/tracking/components/FnbTrackingActiveView.jsx');
const fnbTrackingCompletedViewSource = () => readSource('modes/fnb/tracking/components/FnbTrackingCompletedView.jsx');
const pickupTrackingMobileViewSource = () => readSource('features/tracking/components/PickupTrackingMobileView.jsx');
const guestTrackingDrawerSource = () => readSource('tracking/components/GuestTrackingDrawer.jsx');
const accountPageSource = () => readSource('customer-dashboard/pages/DgfyCustomerAccountPage.jsx');
const businessSectionSource = () => readSource('customer-dashboard/components/BusinessSection.jsx');
const customerAccountPanelHookSource = () => readSource('customer-dashboard/hooks/useCustomerAccountPanel.js');
const panelSource = () => readSource('modes/fnb/storefront/components/FnbReservationPanel.jsx');
const solutionsPageSource = () => readSource('discovery/pages/SolutionsPage.jsx');
const businessRegistrationUrlSource = () => readSource('shared/utils/businessRegistrationUrl.js');

describe('Food & Beverage storefront contract', () => {
  it('keeps route constants and navigation outside the root shell', () => {
    const source = appSource();
    const routing = routingSource();
    const navigation = navigationSource();

    expect(routing).toContain("export const STORE_ITEM_SUBPAGE = 'item';");
    expect(routing).toContain("export const STORE_TRACK_SUBPAGE = 'track';");
    expect(navigation).toContain('buildItemDetailTarget');
    expect(navigation).toContain('buildTrackTarget');
    expect(source).toContain("from './app/routing/storefrontRouting.js'");
    expect(source).toContain("from './app/routing/storefrontNavigation.js'");
    expect(source).not.toContain("const STORE_ITEM_SUBPAGE = 'item';");
  });

  it('mounts F&B storefront item details through mode-owned route modules', () => {
    const source = appSource();
    const routeSource = productDetailsRouteSource();
    const detailsSource = productDetailsPageSource();
    const mediaSource = productDetailsMediaSource();

    expect(source).toContain('FnbProductDetailsRoute');
    expect(source).toContain('useFnbProductDetailsRoute');
    expect(source).toContain('useFnbProductDetailNavigation');
    expect(routeSource).toContain('FnbProductDetailsPage');
    expect(detailsSource).toContain('FnbProductMediaGallery');
    expect(mediaSource).toContain('aria-label="View larger image"');
    expect(mediaSource).toContain('aria-label="Previous slide"');
    expect(mediaSource).toContain('aria-label="Next slide"');
    expect(storefrontCatalogHookSource()).toContain('filterCatalogItems');
    expect(catalogRuntimeSource()).toContain('buildFnbCatalogPresentation');
  });

  it('keeps the customer-facing item QR out of Storefront item details', () => {
    const detailsSource = productDetailsPageSource();
    const routePropsSource = productDetailsRoutePropsSource();

    expect(routePropsSource).not.toContain('storeSlug:');
    expect(detailsSource).not.toContain('StorefrontItemQrCard');
    expect(detailsSource).not.toContain('storefrontItemUrl');
  });

  it('resolves Storefront item availability before showing a final detail state', () => {
    const appSource = storefrontAppSource();
    const containerSource = catalogRouteContainerSource();
    const detailsSource = productDetailsPageSource();
    const loadingStateIndex = detailsSource.indexOf('if (!item && loading)');
    const errorStateIndex = detailsSource.indexOf('if (!item && loadError)');
    const unavailableStateIndex = detailsSource.indexOf('if (!item) {');

    expect(appSource).toContain('!isFnbDetailsSubpage && (');
    expect(appSource).toContain('(isFnbDetailsSubpage || (catalogPermitted && selectedStore))');
    expect(containerSource).toContain('if (isFnbDetailsSubpage)');
    expect(containerSource).toContain('loading={loadingCatalog || (!selectedStore && !catalogError)}');
    expect(containerSource).toContain('loadError={catalogError}');
    expect(containerSource).toContain('onRetry={refreshStorePageForTenantSetup}');
    expect(detailsSource).toContain('Checking item availability...');
    expect(detailsSource).toContain('Unable to load item');
    expect(loadingStateIndex).toBeGreaterThan(-1);
    expect(errorStateIndex).toBeGreaterThan(loadingStateIndex);
    expect(unavailableStateIndex).toBeGreaterThan(errorStateIndex);
  });

  it('opens the cart drawer from product details without changing menu-card fly behavior', () => {
    const detailActions = productDetailActionsSource();
    const productCard = productCardSource();
    const cartMutations = cartMutationsHookSource();

    expect(detailActions).toContain('openCart: true');
    expect(cartMutations).toContain('Boolean(options?.openCart) || !isFnbMode');
    expect(productCard).toContain('sourceRect: getCartFlySourceRect(event)');
    expect(productCard).not.toContain('openCart: true');
  });

  it('keeps menu metadata, modifiers, allergens, and reviews available in F&B modules', () => {
    const source = appSource();
    const detailsSource = productDetailsPageSource();
    const nutritionSource = productDetailsNutritionSource();
    const reviewsSource = productDetailsReviewsSource();

    expect(source).toContain('fnb_modifier_groups');
    expect(source).toContain('getDefaultFnbLineModifiers');
    expect(source).toContain('line_modifiers');
    expect(detailsSource).toContain('FnbProductNutritionAllergens');
    expect(nutritionSource).toContain('Allergens');
    expect(detailsSource).toContain('FnbProductReviewsSection');
    expect(reviewsSource).toContain('Reviews & Ratings');
    expect(itemReviewRuntimeSource()).toContain('/api/v1/dgfy/customer/reviews/public?');
    expect(itemReviewRuntimeSource()).toContain('openFnbItemReviewFromInvite');
  });

  it('keeps customer dashboard and business contracts feature-owned', () => {
    const source = appSource();
    const accountSource = accountPageSource();
    const businessSource = businessSectionSource();

    expect(source).toContain('useCustomerDashboardRuntime');
    expect(source).toContain('useCustomerDashboardRouteOutlet');
    expect(source).toContain('handleOpenBusinessInventory');
    expect(source).toContain('trackedCustomerActivity');
    expect(accountSource).toContain('BusinessSection');
    expect(accountSource).toContain('businessMemberships');
    expect(accountSource).toContain('onOpenBusinessPos');
    expect(businessSource).toContain('Your businesses');
    expect(businessSource).toContain('Pending invitations');
    expect(businessSource).toContain("startBusinessAction('accept'");
    expect(customerAccountPanelHookSource()).toContain('if (!isDgfyCustomerSignedIn || accountPanel?.loading) return;');
  });

  it('shows signed-in saved addresses in F&B delivery checkout before map pinning', () => {
    const source = signedInCheckoutAddressesSource();

    expect(source).toContain('accountSavedDeliveryLocations');
    expect(source).toContain('defaultAccountDeliveryLocation');
    expect(source).toContain('applySavedDeliveryLocation');
    expect(source).toContain('handleSetDefaultDeliveryAddress');
    expect(source).toContain('handleRemoveDeliveryAddress');
    expect(source).toContain('/api/v1/dgfy/customer/addresses');
  });

  it('builds pickup and delivery checkout payloads from the F&B-owned model', () => {
    const source = checkoutPayloadSource();

    expect(source).toContain('promo_code');
    expect(source).toContain("delivery_address: String(deliveryAddress || '').trim()");
    expect(source).toContain('delivery_latitude: isDeliveryOrder ? toNumberOrNull(customerPin?.latitude) : null');
    expect(source).toContain('delivery_longitude: isDeliveryOrder ? toNumberOrNull(customerPin?.longitude) : null');
    expect(source).toContain('line_modifiers');
  });

  it('offers only cash payment until online checkout is configured', () => {
    const source = checkoutPaymentOptionsSource();
    const checkoutRouteContainer = checkoutRouteContainerSource();

    expect(source).toContain("{ value: 'cash', label: 'Cash on delivery/pickup' }");
    expect(source).toContain('isEnabledStorefrontCheckoutPaymentType');
    expect(source).not.toContain("value: 'gcash'");
    expect(source).not.toContain("value: 'maya'");
    expect(source).not.toContain("value: 'card'");
    expect(cartDrawerShellContainerSource()).toContain('FnbCheckoutRouteContainer');
    expect(checkoutRouteContainer).toContain('isEnabledStorefrontCheckoutPaymentType');
    expect(checkoutSubmissionHookSource()).toContain('payment_type: fnbPaymentType');
  });

  it('mounts F&B checkout route and cart drawer through mode-owned modules', () => {
    const source = appSource();
    const checkoutRouteContainer = checkoutRouteContainerSource();

    expect(cartDrawerShellContainerSource()).toContain('FnbCheckoutRouteContainer');
    expect(source).toContain('FnbCartDrawerRoute');
    expect(checkoutRouteContainer).toContain('FnbCheckoutRouteMount');
    expect(checkoutRouteContainer).toContain('FnbCheckoutRouteBody');
    expect(checkoutRouteContainer).toContain('FnbCheckoutCustomerStep');
    expect(checkoutRouteContainer).toContain('FnbCheckoutFulfillmentStep');
    expect(checkoutRouteContainer).toContain('FnbCheckoutPaymentStep');
    expect(checkoutRouteContainer).toContain('FnbCheckoutSummaryContent');
    expect(checkoutRouteMountSource()).toContain('FnbCheckoutRoutePage');
    expect(checkoutSubmissionSource()).toContain('/api/v1/store/checkout');
    expect(checkoutSubmissionSource()).toContain('goStoreTrackPage({ pin: trackingPin });');
  });

  it('keeps tracking drawer and tracking page under F&B tracking ownership', () => {
    const source = appSource();
    const payload = fnbTrackingPayloadSource();

    expect(cartDrawerShellContainerSource()).toContain('FnbTrackingRouteContainer');
    expect(source).toContain('useFnbTrackingRuntime');
    expect(source).toContain('useFnbTrackingDrawerPresentation');
    expect(fnbTrackingContainerSource()).toContain('TrackingDrawerMount');
    expect(fnbTrackingContainerSource()).toContain('FnbTrackingRoutePage');
    expect(guestTrackingDrawerSource()).toContain('export { TrackingDrawer as GuestTrackingDrawer }');
    expect(readSource('tracking/components/TrackingDrawer.jsx')).toContain('Active orders linked to your DGFY account.');
    expect(payload).toContain('display_snapshot');
    expect(payload).toContain('display');
    expect(payload).toContain('Array.isArray(order?.lines)');
    expect(payload).toContain('deliveryAddress');
  });

  it('preserves promo discount labels across F&B tracking summaries', () => {
    expect(fnbTrackingAdapterSource()).toContain('discountAmount');
    expect(fnbTrackingAdapterSource()).toContain('discountLabel');
    expect(fnbTrackingPayloadSource()).toContain('discount_amount: view.discountAmount');
    expect(fnbTrackingDrawerTotalsSource()).toContain('Promo / Discount');
    expect(fnbTrackingActiveViewSource()).toContain('viewModel.discountLabel');
    expect(fnbTrackingCompletedViewSource()).toContain('viewModel.discountLabel');
    expect(pickupTrackingMobileViewSource()).toContain('discountLabel');
  });

  it('keeps public reservation request and registration links working', () => {
    const source = appSource();
    const panel = panelSource();
    const solutionsSource = solutionsPageSource();
    const helperSource = businessRegistrationUrlSource();

    expect(source).toContain("id: 'reservation'");
    expect(source).toContain('/api/v1/store/fnb/reservations');
    expect(panel).toContain('Reservation Request');
    expect(panel).toContain('Send Request');
    expect(source).toContain('buildBusinessRegistrationUrl');
    expect(solutionsSource).toContain('buildBusinessRegistrationUrl');
    // Business registration is hosted in-app at dgfy.ph/business/grow now
    // (formerly a redirect out to skupervisor.dgfy.ph/register-company).
    expect(helperSource).toContain('/business/grow');
  });

  it('keeps storefront generated fallback copy out of F&B mode', () => {
    const source = appSource();

    expect(source).not.toContain('buildFnbContentReadinessItems');
    expect(source).not.toContain('buildFnbOverviewFallbackCopy');
    expect(source).not.toContain('Menu at a glance');
    expect(source).not.toContain('published menu item');
  });
});

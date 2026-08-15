import React from 'react';
import { RetailOrderPage } from '../../checkout/pages/RetailOrderPage.jsx';
import { RetailTrackingRouteContainer } from '../../tracking/pages/RetailTrackingRouteContainer.jsx';
import { RetailCatalogRoutePage } from './RetailCatalogRoutePage.jsx';
import { RetailProductDetailsRoute } from './RetailProductDetailsRoute.jsx';
import { RetailStorefrontRoutePage } from './RetailStorefrontRoutePage.jsx';

/**
 * Retail-owned route composition boundary.
 *
 * The app dispatcher may prepare shared runtime data, but Retail owns which
 * Retail page renders for details, tracking, checkout, and the main storefront.
 */
export function RetailStorefrontRouteContainer({
  catalogProps,
  detailsProps,
  hasStorefrontModel,
  isDetailsSubpage,
  isOrderSubpage,
  isTrackSubpage,
  orderProps,
  sectionsProps,
  trackingProps
}) {
  if (isDetailsSubpage) {
    return <RetailProductDetailsRoute isActive {...detailsProps} />;
  }

  if (isTrackSubpage && trackingProps) {
    return <RetailTrackingRouteContainer {...trackingProps} visible renderDrawer={false} />;
  }

  if (isOrderSubpage && hasStorefrontModel) {
    return <RetailOrderPage {...orderProps} />;
  }

  if (!hasStorefrontModel) {
    return null;
  }

  return (
    <>
      <RetailCatalogRoutePage {...catalogProps} />
      <RetailStorefrontRoutePage {...sectionsProps} />
    </>
  );
}

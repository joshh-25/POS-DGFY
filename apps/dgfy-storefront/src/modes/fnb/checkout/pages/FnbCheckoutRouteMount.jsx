import React from 'react';
import { FnbCheckoutRoutePage } from './FnbCheckoutRoutePage.jsx';

/**
 * Owns F&B checkout-route activation and its outer presentation frame.
 * Step state and high-risk delivery-map interactions remain feature children.
 */
export function FnbCheckoutRouteMount({ children, isActive, ...routePageProps }) {
  if (!isActive) return null;

  return <FnbCheckoutRoutePage {...routePageProps}>{children}</FnbCheckoutRoutePage>;
}

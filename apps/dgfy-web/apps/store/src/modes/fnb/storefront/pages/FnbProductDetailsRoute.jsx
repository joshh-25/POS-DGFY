import React from 'react';
import { FnbProductDetailsPage } from './FnbProductDetailsPage.jsx';

/**
 * Owns the F&B product-details route mount. Route selection remains in the
 * shell while Simple mode continues to use the shared detail-page contract.
 */
export function FnbProductDetailsRoute({ isActive, ...productDetailsProps }) {
  if (!isActive) return null;

  return <FnbProductDetailsPage {...productDetailsProps} />;
}

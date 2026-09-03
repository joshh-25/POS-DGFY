import React from 'react';

import { FnbProductDetailsPage } from '../../../fnb/storefront/pages/FnbProductDetailsPage.jsx';

/**
 * Retail-owned product-details route adapter.
 *
 * The current product-details renderer remains shared with the mature catalog
 * implementation, while this boundary owns Retail terminology and presentation.
 * Callers do not mount an F&B route for a Retail URL.
 */
export function RetailProductDetailsRoute({ isActive, presentation, ...productDetailsProps }) {
  if (!isActive) return null;

  return (
    <FnbProductDetailsPage
      {...productDetailsProps}
      presentation={{
        ...presentation,
        catalogLabel: 'Products',
        compactTypography: true,
        mediaObjectFit: 'cover',
      }}
    />
  );
}

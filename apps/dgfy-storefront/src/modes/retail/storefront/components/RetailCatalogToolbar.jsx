import React from 'react';

import { FNB_CATEGORY_ICON_MAP } from '../../../fnb/storefront/model/fnbStorefrontPresentation.js';
import { StorefrontCatalogToolbar } from '../../../../shared/components/storefront/StorefrontCatalogToolbar.jsx';
import { STYLES } from '../../../../shared/theme/storefrontStyleTokens.js';

export function RetailCatalogToolbar(props) {
  return (
    <StorefrontCatalogToolbar
      FNB_CATEGORY_ICON_MAP={FNB_CATEGORY_ICON_MAP}
      STYLES={STYLES}
      {...props}
      showViewToggle
    />
  );
}

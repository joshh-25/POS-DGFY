import React, { useEffect, useMemo, useRef, useState } from 'react';

import { StorefrontCatalogToolbar } from '../../../../shared/components/storefront/StorefrontCatalogToolbar.jsx';
import { STYLES } from '../../../../shared/theme/storefrontStyleTokens.js';
import { SERVICE_CATEGORY_ICON_MAP } from '../model/serviceCategoryIconMap.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';
import { formatServiceNumber } from '../../servicesFormatters.js';

const NOOP = () => {};

function ServicesCatalogToolbar({
  catalogSearch,
  isMobileViewport,
  resolvedTab,
  serviceSortOption,
  servicesBodyFont,
  servicesDisplayFont,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  servicesPrimaryShadow,
  servicesViewMode = 'list',
  catalogPresentation = {},
  servicesViewModel,
  setActiveServiceTab,
  setCatalogSearch,
  setServiceSortOption,
  setServicesViewMode = NOOP,
  visibleServiceCount
}) {
  const categoryDropdownRef = useRef(null);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  useEffect(() => {
    if (!isCategoryDropdownOpen) return undefined;
    const handleOutsidePointer = (event) => {
      if (!categoryDropdownRef.current?.contains(event.target)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [isCategoryDropdownOpen]);

  // RF-4 (PR #1583 review): adapts `serviceGroups` to the shared `StorefrontCatalogToolbar`'s
  // `menuSections` shape. `sectionIdentity` (the stable, folder_id-based identity
  // `servicesStorefrontViewModel.js` computes as `group.categoryIdentity`) MUST be carried
  // through -- the earlier version of this adapter dropped it, so two distinct-`folder_id`
  // service categories that happened to share a normalized `categoryKey` display text collapsed
  // into one selectable tab in the shared toolbar. `sectionKey`/`sectionLabel` stay name-derived,
  // display only.
  const toolbarViewModel = useMemo(() => {
    const allServices = Array.isArray(servicesViewModel?.allServices) ? servicesViewModel.allServices : [];
    const serviceGroups = Array.isArray(servicesViewModel?.serviceGroups) ? servicesViewModel.serviceGroups : [];
    return {
      menuItems: allServices,
      menuSections: serviceGroups.map((group) => ({
        sectionKey: group.categoryKey,
        sectionLabel: group.categoryMeta?.label || group.categoryKey || 'Services',
        sectionIdentity: group.categoryIdentity,
        items: Array.isArray(group.items) ? group.items : [],
        visualMeta: {
          iconToken: group.categoryMeta?.iconToken || 'service',
          glyph: String(group.categoryMeta?.label || group.categoryKey || 'S').charAt(0).toUpperCase(),
          accent: group.categoryMeta?.accent || servicesPrimary,
          accentSoft: group.categoryMeta?.accentBg || servicesPrimarySoft
        }
      })),
      totalItems: Number.isFinite(Number(visibleServiceCount)) ? Number(visibleServiceCount) : allServices.length
    };
  }, [servicesPrimary, servicesPrimarySoft, servicesViewModel, visibleServiceCount]);

  const modeAdapter = useMemo(() => ({
    catalogEyebrow: catalogPresentation.eyebrow,
    catalogHeading: catalogPresentation.heading,
    catalogSubtitle: catalogPresentation.subtitle,
    catalogPriceAllLabel: catalogPresentation.priceAllLabel,
    catalogCategoryLabel: catalogPresentation.categoryLabel,
    catalogCategoryAllLabel: catalogPresentation.categoryAllLabel,
    catalogCategoryIconToken: catalogPresentation.categoryIconToken,
    catalogSearchPlaceholder: catalogPresentation.searchPlaceholder,
    catalogItemNounSingular: 'service',
    catalogItemNounPlural: 'services',
    formatCatalogCount: formatServiceNumber,
    catalogMaxWidth: catalogPresentation.maxWidth,
    catalogHorizontalPadding: catalogPresentation.horizontalPadding,
    catalogUseOuterGutter: catalogPresentation.usesOuterGutter,
    catalogToolbarVariant: catalogPresentation.toolbarVariant,
    catalogHeaderDivider: true,
    heroTheme: {
      accent: servicesPrimary,
      accentDark: servicesPrimaryDark,
      accentSoft: servicesPrimarySoft,
      borderSoft: servicesPrimaryBorder,
      accentShadow: servicesPrimaryShadow,
      surfaceInset: servicesPrimarySoft,
      textPrimary: SERVICES_PALETTE.textPrimary,
      textMuted: SERVICES_PALETTE.textMuted,
      surfaceShadow: SERVICES_PALETTE.cardShadow,
      catalogPalette: {
        primary: servicesPrimary,
        primaryHover: servicesPrimaryDark,
        accentSoft: servicesPrimarySoft,
        surface: SERVICES_PALETTE.surface,
        border: SERVICES_PALETTE.border,
        borderStrong: servicesPrimary
      },
      bodyFont: servicesBodyFont,
      displayFont: servicesDisplayFont
    }
  }), [catalogPresentation, servicesBodyFont, servicesDisplayFont, servicesPrimary, servicesPrimaryBorder, servicesPrimaryDark, servicesPrimaryShadow, servicesPrimarySoft]);

  return (
    <StorefrontCatalogToolbar
      FNB_CATEGORY_ICON_MAP={SERVICE_CATEGORY_ICON_MAP}
      STYLES={STYLES}
      catalogSearch={catalogSearch}
      filteredFnbViewModel={toolbarViewModel}
      fnbCategoryDropdownRef={categoryDropdownRef}
      fnbSortOption={serviceSortOption === 'recommended' ? 'name_asc' : serviceSortOption}
      fnbViewMode={servicesViewMode}
      isFnbCategoryDropdownOpen={isCategoryDropdownOpen}
      isMobileViewport={isMobileViewport}
      modeAdapter={modeAdapter}
      resolvedFnbSection={resolvedTab}
      setActiveServiceTab={setActiveServiceTab}
      setCatalogSearch={setCatalogSearch}
      setFnbSortOption={(nextValue) => setServiceSortOption(nextValue === 'name_asc' ? 'recommended' : nextValue)}
      setFnbViewMode={setServicesViewMode}
      setIsFnbCategoryDropdownOpen={setIsCategoryDropdownOpen}
      showViewToggle
    />
  );
}

export { ServicesCatalogToolbar };

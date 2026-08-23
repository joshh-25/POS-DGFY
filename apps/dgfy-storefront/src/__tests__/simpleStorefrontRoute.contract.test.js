import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Simple storefront route boundary', () => {
  it('owns Simple storefront sections outside the shared catalog renderer', () => {
    const simpleRoute = readSource('modes/simple/storefront/pages/SimpleStorefrontRoutePage.jsx');
    const classicCatalog = readSource('shared/components/storefront/StorefrontClassicCatalog.jsx');
    const routeContainer = readSource('app/pages/StorefrontCatalogRouteContainer.jsx');

    expect(simpleRoute).toContain('export function SimpleStorefrontRoutePage');
    expect(simpleRoute).toContain('StorefrontPromoSection');
    expect(simpleRoute).toContain('palette="simple"');
    expect(simpleRoute).toContain('StorefrontReviewsSection');
    expect(simpleRoute).toContain('StorefrontFooterSection');
    expect(routeContainer).toContain('SimpleStorefrontRoutePage');
    expect(classicCatalog).not.toContain('SimpleStorefrontRoutePage');
  });

  it('binds configured About Us and gallery content to Simple-owned hero components', () => {
    const simpleHero = readSource('modes/simple/storefront/components/SimpleHero.jsx');
    const simpleHeroAbout = readSource('modes/simple/storefront/components/SimpleHeroAbout.jsx');
    const simpleHeroMobile = readSource('modes/simple/storefront/components/SimpleHeroMobileInfoCards.jsx');
    const simpleHeroGallery = readSource('modes/simple/storefront/components/SimpleHeroGallery.jsx');
    const simpleProductCard = readSource('modes/simple/storefront/components/SimpleProductCard.jsx');
    const simpleCatalogToolbar = readSource('modes/simple/storefront/components/SimpleCatalogToolbar.jsx');
    const storefrontCatalogModel = readSource('shared/hooks/useStorefrontCatalog.js');

    expect(storefrontCatalogModel).toContain('galleryImagesFull: galleryImages');
    expect(simpleHero).toContain('simpleHeroModel.aboutText');
    expect(simpleHero).toContain('hasGallerySection');
    expect(simpleHeroAbout).toContain('SimpleHeroGallery');
    expect(simpleHeroMobile).toContain('SimpleHeroGallery');
    expect(simpleHeroMobile).toContain('compactMobile');
    expect(simpleHeroMobile).toContain('hasAboutToggle');
    expect(simpleHeroMobile).toContain('mobileSectionBackground');
    expect(simpleHeroMobile).toContain('infoCardShadow');
    expect(simpleHeroMobile).toContain('infoCardBorder');
    expect(simpleHeroMobile).toContain('border: `1.5px solid ${infoCardBorder}`');
    expect(simpleHero).toContain("background: '#fff'");
    expect(simpleHero).toContain('marginBottom: isMobileViewport ? 0 : 40');
    expect(simpleHero).toContain('simpleActionShadow');
    expect(simpleHero).toContain('simpleContainerShadow');
    expect(simpleProductCard).toContain('rgba(23,107,58,0.05)');
    expect(simpleCatalogToolbar).toContain('rgba(23,107,58,0.10)');
    expect(simpleHeroGallery).toContain('View all photos');
    expect(simpleHeroGallery).toContain('aria-label="View store photos"');
    expect(simpleHeroGallery).toContain('aria-label="Storefront gallery"');
  });

  it('keeps the Simple catalog controls and card palette mode-owned', () => {
    const catalogToolbar = readSource('modes/simple/storefront/components/SimpleCatalogToolbar.jsx');
    const catalogRoute = readSource('modes/simple/storefront/pages/SimpleCatalogRoutePage.jsx');
    const classicCatalog = readSource('shared/components/storefront/StorefrontClassicCatalog.jsx');
    const simpleProductCard = readSource('modes/simple/storefront/components/SimpleProductCard.jsx');

    expect(catalogToolbar).toContain('Product Categories');
    expect(catalogToolbar).toContain('SIMPLE_CATEGORY_ICON_MAP');
    expect(catalogRoute).toContain('SimpleProductCard');
    expect(classicCatalog).not.toContain('SimpleProductCard');
    expect(classicCatalog).not.toContain('SimpleCheckoutRoutePage');
    expect(simpleProductCard).toContain('const catalogPalette = heroTheme.catalogPalette');
    expect(simpleProductCard).toContain('Add to Cart');
    expect(simpleProductCard).toContain('categoryLabel');
    expect(simpleProductCard).toContain('const cardTitleTypography = typography.cardTitle || {};');
    expect(catalogToolbar).toContain('typography.catalogTitle');
  });

  it('uses the shared sectioned catalog presentation for Simple pagination', () => {
    const routeContainer = readSource('app/pages/StorefrontCatalogRouteContainer.jsx');
    const pagination = readSource('modes/simple/storefront/components/SimpleCatalogPagination.jsx');

    expect(routeContainer).toContain('const usesSectionedCatalogPresentation = isFnbMode || isRetailMode || isSimpleMode;');
    expect(routeContainer).toContain('const totalFnbPages = usesSectionedCatalogPresentation ? fnbCatalogPresentation.totalPages : 1;');
    expect(routeContainer).toContain('const catalogItemsToRender = usesSectionedCatalogPresentation ? fnbCatalogPresentation.visibleItems : itemsToRender;');
    expect(pagination).toContain("const accent = '#176B3A'");
    expect(pagination).toContain('SimpleCatalogPagination');
  });

  it('mounts the shared tracking drawer for Simple storefronts', () => {
    const app = readSource('StorefrontApp.jsx');
    const shellProps = readSource('app/hooks/useStorefrontCartDrawerShellProps.js');
    const shell = readSource('app/pages/StorefrontCartDrawerShellContainer.jsx');
    const drawerProps = readSource('modes/simple/tracking/model/buildSimpleTrackingDrawerProps.js');

    expect(drawerProps).toContain('canOpen: canOpenTrackingDrawer && !isStandaloneTrackingPage');
    expect(drawerProps).toContain('orders: trackingDrawerOrders');
    expect(app).toContain('const simpleTrackingDrawerProps = buildSimpleTrackingDrawerProps({');
    expect(shellProps).toContain('simpleTrackingDrawerProps');
    expect(shell).toContain("import { TrackingDrawerMount } from '../../tracking/components/TrackingDrawerMount.jsx';");
    expect(shell).toContain('{isSimpleMode && <TrackingDrawerMount {...simpleTrackingDrawerProps} />}');
  });

  it('wires the existing order route into the MSME storefront header', () => {
    const app = readSource('StorefrontApp.jsx');
    const heroBandProps = readSource('app/hooks/useStorefrontHeroBandProps.js');
    const heroBand = readSource('app/pages/StorefrontHeroBandContainer.jsx');
    const simpleHero = readSource('modes/simple/storefront/components/SimpleHero.jsx');

    expect(app).toContain('goStoreOrderPage,');
    expect(heroBandProps).toContain('goStoreOrderPage,');
    expect(heroBand).toContain('goStoreOrderPage={goStoreOrderPage}');
    expect(simpleHero).toContain("onOrder={() => goStoreOrderPage({ initialTab: 'checkout' })}");
  });
});

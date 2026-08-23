// Contract test for #694: a visible voucher-code entry button on the catalog page, below the item
// count, wired to #672's already-shipped apply pipeline. Source-text assertions, matching the
// convention every other *.contract.test.js file in this directory already uses.

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

const voucherCodePanelSource = () => readSource('shared/components/storefront/VoucherCodePanel.jsx');
const storefrontCatalogToolbarSource = () => readSource('shared/components/storefront/StorefrontCatalogToolbar.jsx');
const simpleCatalogToolbarSource = () => readSource('modes/simple/storefront/components/SimpleCatalogToolbar.jsx');
const catalogLoaderSource = () => readSource('shared/hooks/useStoreCatalogLoader.js');
const catalogRoutePropsSource = () => readSource('app/hooks/useStorefrontCatalogRouteProps.js');
const catalogRouteContainerSource = () => readSource('app/pages/StorefrontCatalogRouteContainer.jsx');
const retailCatalogRoutePageSource = () => readSource('modes/retail/storefront/pages/RetailCatalogRoutePage.jsx');
const fnbCatalogRoutePageSource = () => readSource('modes/fnb/storefront/pages/FnbCatalogRoutePage.jsx');
const simpleCatalogRoutePageSource = () => readSource('modes/simple/storefront/pages/SimpleCatalogRoutePage.jsx');
const promoRenderersSource = () => readSource('modes/fnb/checkout/hooks/useFnbCheckoutPromoRenderers.jsx');

describe('Storefront catalog voucher-entry contract (#694)', () => {
  it('hoists VoucherCodePanel to shared/ and exports normalizeVoucherCode for reuse', () => {
    const source = voucherCodePanelSource();
    expect(source).toContain('export const normalizeVoucherCode');
    expect(source).toContain('export function VoucherCodePanel');
    // helperText/triggerLabel are additive props for the catalog-page render -- the checkout
    // render's default copy must stay byte-identical (helperText defaults to null).
    expect(source).toContain('helperText = null');
  });

  it('the checkout promo-panel renderer imports VoucherCodePanel from its new shared location', () => {
    const source = promoRenderersSource();
    expect(source).toContain("from '../../../../shared/components/storefront/VoucherCodePanel.jsx'");
    expect(source).not.toContain("from '../components/VoucherCodePanel.jsx'");
  });

  it('the old fnb/checkout/components/VoucherCodePanel.jsx location no longer exists', () => {
    const oldPath = path.join(appRoot, 'modes/fnb/checkout/components/VoucherCodePanel.jsx');
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  // #776/#695: PromoCodePanel merged into VoucherCodePanel rather than stacked alongside it (see
  // the renderer hook's own comment for the full reasoning) -- its "Available Promos" listing lives
  // on in VoucherCodePanel's availableOffers prop instead. PromoCodePanel.jsx itself must still
  // exist -- only the renderer's usage of it is gone.
  it('no longer renders PromoCodePanel from the checkout promo-panel renderer', () => {
    const source = promoRenderersSource();
    expect(source).not.toContain('<PromoCodePanel');
    expect(source).not.toContain("from '../components/PromoCodePanel.jsx'");
  });

  it('PromoCodePanel.jsx itself is left in place, not deleted', () => {
    const panelPath = path.join(appRoot, 'modes/fnb/checkout/components/PromoCodePanel.jsx');
    expect(fs.existsSync(panelPath)).toBe(true);
  });

  it('the checkout promo-panel renderer feeds promoSectionModel into VoucherCodePanel as availableOffers', () => {
    const source = promoRenderersSource();
    expect(source).toMatch(/availableOffers=\{Array\.isArray\(promoSectionModel\) \? promoSectionModel : \[\]\}/);
  });

  for (const [label, sourceFn] of [
    ['StorefrontCatalogToolbar (fnb + retail)', storefrontCatalogToolbarSource],
    ['SimpleCatalogToolbar', simpleCatalogToolbarSource]
  ]) {
    it(`${label} renders a voucher-entry button gated on handleVoucherCardApply`, () => {
      const source = sourceFn();
      expect(source).toContain('VoucherCodePanel');
      expect(source).toContain('handleVoucherCardApply');
      expect(source).toContain('checkoutVoucherCode');
      // Rendered conditionally, not unconditionally -- a caller that doesn't wire the handler
      // (there are none today, but the contract should hold) must not crash on a missing prop.
      expect(source).toMatch(/voucherEntry\s*=\s*handleVoucherCardApply\s*\?/);
    });
  }

  it('useStoreCatalogLoader keeps voucherCode out of openStoreBySlug\'s own dependency array', () => {
    const source = catalogLoaderSource();
    expect(source).toContain('voucherCodeRef');
    // The callback's dependency array (ending the openStoreBySlug useCallback) must not list
    // voucherCode directly -- applying a code on the catalog page must not trigger a full store
    // reload (profile + locations + catalog). The location-aware effect below keeps voucherCode as
    // a real dependency; that one is fine and asserted separately below.
    const openStoreBySlugDeps = source.match(/\}, \[applyCatalogResponse, preferredStoreLocationSelection[^\]]*\]\);/);
    expect(openStoreBySlugDeps).not.toBeNull();
    expect(openStoreBySlugDeps[0]).not.toContain('voucherCode]');
    expect(openStoreBySlugDeps[0]).not.toContain('voucherCode,');
  });

  it('the location-aware catalog effect still refetches on a voucherCode change', () => {
    const source = catalogLoaderSource();
    const effectDeps = source.match(/\[applyCatalogResponse, isStorePage, selectedStore\?\.slug, selectedLocationId, voucherCode\]/);
    expect(effectDeps).not.toBeNull();
  });

  it('the catalog route props bundle threads checkoutVoucherCode/setCheckoutVoucherCode/handleVoucherCardApply', () => {
    for (const source of [catalogRoutePropsSource(), catalogRouteContainerSource()]) {
      expect(source).toContain('checkoutVoucherCode');
      expect(source).toContain('setCheckoutVoucherCode');
      expect(source).toContain('handleVoucherCardApply');
    }
  });

  it('all three catalog route pages (retail, fnb, simple) receive the voucher props', () => {
    for (const source of [retailCatalogRoutePageSource(), fnbCatalogRoutePageSource(), simpleCatalogRoutePageSource()]) {
      expect(source).toContain('checkoutVoucherCode');
      expect(source).toContain('handleVoucherCardApply');
    }
  });
});

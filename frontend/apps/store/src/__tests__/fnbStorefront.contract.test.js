import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = () => fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');
const panelSource = () => fs.readFileSync(path.join(appRoot, 'FnbReservationPanel.jsx'), 'utf8');
const productDetailsSource = () => fs.readFileSync(path.join(appRoot, 'Components/storefront/pages/FnbProductDetailsPage.jsx'), 'utf8');
const accountPageSource = () => fs.readFileSync(path.join(appRoot, 'Components/storefront/pages/DgfyCustomerAccountPage.jsx'), 'utf8');

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
    expect(productDetailsSource()).toContain('image_gallery');
    expect(source).toContain('const openFnbDetail = useCallback((item, options = {}) => {');
    expect(source).toContain('const closeFnbDetail = () => {');
    expect(source).toContain('isFnbDetailsSubpage');
  });

  it('keeps DGFY account and checkout contracts wired through Storefront account routes', () => {
    const source = appSource();
    const accountSource = accountPageSource();

    expect(source).toContain('const readStorefrontCustomerAuthToken = () => readDgfyAuthToken() || readStoreAuthToken();');
    expect(source).toContain('authToken: readStorefrontCustomerAuthToken()');
    expect(source).toContain('onCancelOrder={handleCancelAccountOrder}');
    expect(source).toContain('onReorderOrder={handleReorderAccountOrder}');
    expect(source).not.toContain('isAccountDrawerOpen && (isGuestAccountDrawerState ?');
    expect(accountSource).toContain('allowed_actions');
    expect(accountSource).toContain('onCancelOrder?.(order)');
    expect(accountSource).toContain('onReorderOrder?.(order)');
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
});

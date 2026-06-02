import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = () => fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');
const panelSource = () => fs.readFileSync(path.join(appRoot, 'FnbReservationPanel.jsx'), 'utf8');

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
    expect(source).toContain('const openFnbDetail = (item, options = {}) => {');
    expect(source).toContain('const closeFnbDetail = () => {');
    expect(source).toContain('isFnbDetailsSubpage');
  });

  it('adds item-level reviews to the F&B detail experience without redesigning the page shell', () => {
    const source = appSource();

    expect(source).toContain('/api/v1/dgfy/customer/reviews/public?');
    expect(source).toContain('/api/v1/dgfy/customer/review-invites/');
    expect(source).toContain('openFnbItemReviewFromInvite');
    expect(source).toContain('review_invites');
  });

  it('keeps the mobile F&B metadata row data-driven from storefront and follow state', () => {
    const source = appSource();

    expect(source).toContain('followersLabel');
    expect(source).toContain('heroSectionModel.modeLabel');
    expect(source).toContain('heroSectionModel.locationLabel');
    expect(source).not.toContain("heroSectionModel.modeLabel || 'Food and beverages'");
    expect(source).toContain('mobileHeroMetaItems');
    expect(source).toContain("flexWrap: 'nowrap'");
    expect(source).toContain("overflowX: 'auto'");
    expect(source).not.toContain("heroSectionModel.ratingLabel || 'Fresh menu'");
    expect(source).not.toContain("aboutText || 'This menu storefront is connected to live SKUpervisor product data and the food and beverage backend.'");
    expect(source).not.toContain("heroSectionModel.hours || 'Mon-Sat 9:00 AM - 6:00 PM'");
  });

  it('keeps the new mobile F&B CTAs and category controls functional without reverting the layout', () => {
    const source = appSource();

    expect(source).toContain('heroSectionModel.actions?.canMessage');
    expect(source).toContain('heroSectionModel.actions.messageHref');
    expect(source).toContain('heroSectionModel.actions?.canCall');
    expect(source).toContain('heroSectionModel.actions.callHref');
    expect(source).toContain("section.items?.length || 0");
    expect(source).toContain("onClick={() => setActiveServiceTab('')}");
    expect(source).toContain("placeholder=\"Search meals, drinks, desserts...\"");
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

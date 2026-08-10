import { describe, expect, it } from 'vitest';

import { buildFnbPromoSectionModel } from './fnbPromoModel.js';

describe('buildFnbPromoSectionModel', () => {
  it('prefers POS storefront_promos with real promo codes over legacy display promo data', () => {
    const promos = buildFnbPromoSectionModel({
      selectedStore: {
        storefront_promo: {
          active: true,
          title: 'Display promo',
          subtitle: 'Legacy card only'
        },
        storefront_promos: [
          {
            active: true,
            title: 'Todays Promo',
            subtitle: 'All Dish',
            badge: 'Current offer',
            promo_code: 'PICKY',
            discount_percent: 20,
            validity_text: 'Valid until July 31'
          }
        ]
      },
      supportingPromo: {
        active: true,
        items: [
          {
            active: true,
            title: 'Todays Promo',
            subtitle: 'All Dish',
            promoCode: 'PICKY',
            discountPercent: 20,
            validityText: 'Valid until July 31'
          }
        ]
      }
    });

    expect(promos).toHaveLength(1);
    expect(promos[0]).toEqual(expect.objectContaining({
      promoCode: 'PICKY',
      promo_code: 'PICKY',
      discountPercent: 20,
      discountLabel: '20% OFF',
      subtitle: 'All Dish'
    }));
  });

  it('adds eligible item and category copy from target item ids', () => {
    const promos = buildFnbPromoSectionModel({
      catalog: [
        { item_id: 10, name: 'Inasal', category_name: 'Grilled' },
        { item_id: 11, name: 'Americano', category_name: 'Coffee' }
      ],
      selectedStore: {
        storefront_promos: [
          {
            active: true,
            promo_code: 'MEAL20',
            title: 'Meal deal',
            discount_percent: 20,
            target_item_ids: [10, 11]
          }
        ]
      }
    });

    expect(promos[0]).toEqual(expect.objectContaining({
      eligibleItemsText: 'Inasal, Americano',
      eligibleCategoriesText: 'Grilled, Coffee'
    }));
  });

  it('uses legacy storefront_promo as a code-bearing fallback when storefront_promos is absent', () => {
    const promos = buildFnbPromoSectionModel({
      selectedStore: {
        storefront_promo: {
          active: true,
          title: '20% OFF',
          subtitle: 'All Dish',
          badge: 'TODAYS PROMO',
          validity_text: 'Valid until July 31',
          promo_code: 'TELLME',
          discount_percent: 20
        },
        storefront_promos: null
      }
    });

    expect(promos).toHaveLength(1);
    expect(promos[0]).toEqual(expect.objectContaining({
      promoCode: 'TELLME',
      discountLabel: '20% OFF',
      validityText: 'Valid until July 31'
    }));
  });
});

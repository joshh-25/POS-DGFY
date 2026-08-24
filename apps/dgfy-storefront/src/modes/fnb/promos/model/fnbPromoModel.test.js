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

  // #713: storefront_vouchers (publicly-listed vouchers from the discovery snapshot) become
  // ordinary promo candidates, adapted to the raw promo entry shape -- code -> promo_code,
  // percent_off_bps (basis points) -> discount_percent (0-100).
  describe('#713 storefront_vouchers', () => {
    it('adapts a percent_off voucher into a promo-shaped candidate', () => {
      const promos = buildFnbPromoSectionModel({
        selectedStore: {
          storefront_vouchers: [
            {
              id: 1,
              code: 'GRACEOFFER',
              title: 'Grace Offer',
              subtitle: '10% off your order',
              badge: 'Popular',
              validity_text: 'While supplies last',
              benefit_class: 'percent_off',
              percent_off_bps: 1000,
              active: true
            }
          ]
        }
      });

      expect(promos).toHaveLength(1);
      expect(promos[0]).toEqual(expect.objectContaining({
        promoCode: 'GRACEOFFER',
        title: 'Grace Offer',
        subtitle: '10% off your order',
        discountPercent: 10,
        discountLabel: '10% OFF',
        validityText: 'While supplies last'
      }));
    });

    it('surfaces a non-percent_off voucher on its badge/title, with no fabricated discount label', () => {
      const promos = buildFnbPromoSectionModel({
        selectedStore: {
          storefront_vouchers: [
            {
              id: 2,
              code: 'PHARMA50',
              title: 'Pharmacy Fixed Price',
              subtitle: 'Wholesale pricing',
              badge: 'B2B',
              validity_text: '',
              benefit_class: 'fixed_price',
              percent_off_bps: null,
              active: true
            }
          ]
        }
      });

      expect(promos).toHaveLength(1);
      expect(promos[0]).toEqual(expect.objectContaining({
        promoCode: 'PHARMA50',
        title: 'Pharmacy Fixed Price',
        badge: 'B2B',
        discountPercent: null
      }));
    });

    it('dedupes a voucher and a promo sharing the same code, and combines both sources otherwise', () => {
      const promos = buildFnbPromoSectionModel({
        selectedStore: {
          storefront_promos: [
            { active: true, promo_code: 'SAVE10', title: 'Save 10', discount_percent: 10 }
          ],
          storefront_vouchers: [
            // Same code as the promo above -- the promo (collected first) wins, matching
            // getPromoCandidates' existing storefront_promos-before-legacy precedence order.
            { code: 'SAVE10', title: 'Duplicate code voucher', percent_off_bps: 1500, active: true },
            { code: 'GRACEOFFER', title: 'Grace Offer', percent_off_bps: 1000, active: true }
          ]
        },
        maxItems: 5
      });

      expect(promos).toHaveLength(2);
      const save10 = promos.find((entry) => entry.promoCode === 'SAVE10');
      expect(save10.title).toBe('Save 10');
      expect(promos.some((entry) => entry.promoCode === 'GRACEOFFER')).toBe(true);
    });

    it('drops an inactive voucher, matching how an inactive promo is already dropped', () => {
      const promos = buildFnbPromoSectionModel({
        selectedStore: {
          storefront_vouchers: [
            { code: 'PAUSED1', title: 'Paused voucher', percent_off_bps: 1000, active: false }
          ]
        }
      });

      expect(promos).toHaveLength(0);
    });
  });
});

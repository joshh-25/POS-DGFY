import React from 'react';

/**
 * Shared struck-through voucher price for a catalog item's price badge (#672, the storefront
 * consuming half of #603/#678's API display seam). Consumes the additive wire fields
 * `voucher_price_applied`/`voucher_display_price`/`voucher_badge_only` -- never `default_sale_price`
 * itself, which the API leaves untouched precisely so this component can render both values.
 *
 * Deliberately scoped to plain price content only, not the outer positioned badge container --
 * every price badge across the three product cards (retail/simple/fnb) has its own bespoke
 * absolute-positioning and sizing, and unifying that layout is a separate, larger refactor this
 * issue doesn't need. What actually duplicated (and what this component actually removes) is the
 * struck-through-vs-plain price *decision*, not the container markup around it.
 *
 * `amount_off` vouchers set `voucher_badge_only: true` with no `voucher_display_price` -- an
 * order-level discount cap has no well-defined single-item price shown in isolation, so this
 * component renders the plain price for those (the "Voucher applied" badge, rendered separately via
 * `VoucherAppliedBadge` below, is what signals it).
 *
 * @param {{item: Object, money: (value: number) => string, size?: 'sm'|'md'}} props
 */
export const VoucherPriceDisplay = ({ item, money, size = 'md' }) => {
  const plainPrice = money(item?.default_sale_price ?? 0);
  if (!item?.voucher_price_applied || item.voucher_badge_only || item?.voucher_display_price == null) {
    return <>{plainPrice}</>;
  }

  const strikeFontSize = size === 'sm' ? 10 : 11;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: strikeFontSize, fontWeight: 600, opacity: 0.7, textDecoration: 'line-through' }}>
        {plainPrice}
      </span>
      <span>{money(item.voucher_display_price)}</span>
    </span>
  );
};

/**
 * "Voucher applied" pill, same visual language as the existing inline affiliate-price badge each
 * card already renders (not extracted or touched here -- out of scope), but defined once for the
 * voucher case instead of duplicated per card. Renders for both the priced case and the
 * `voucher_badge_only` case (amount_off), since the badge is the only signal in the latter.
 *
 * @param {{item: Object, accent?: string, style?: Object}} props
 */
export const VoucherAppliedBadge = ({ item, accent = '#059669', style = {} }) => {
  if (!item?.voucher_price_applied) return null;
  return (
    <div style={{
      position: 'absolute',
      background: accent,
      color: '#fff',
      fontSize: 9,
      fontWeight: 800,
      borderRadius: 999,
      padding: '2px 6px',
      lineHeight: 1,
      ...style
    }}>
      Voucher applied
    </div>
  );
};

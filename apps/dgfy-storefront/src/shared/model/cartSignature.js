// #746: a stable fingerprint of the cart's priced content.
//
// A quote response (`/api/v1/store/cart/quote`) describes ONE specific cart. The moment the shopper
// edits the cart, any discount in that response is arithmetic against a cart that no longer exists.
// Comparing the signature the quote was computed against to the live cart is the only honest way to
// answer "is this discount still valid for what I'm looking at."
//
// This deliberately replaces the earlier `!quoteNeedsRefresh` gate, which used the F&B *checkout
// quote lifecycle* flag as a display-validity signal. That flag initializes `true`, is raised by ten
// call sites (including a blanket invalidator on every cart change), and is lowered in exactly one
// place -- so in the cart drawer it was almost always `true`, suppressing the discount entirely
// rather than merely marking it stale. That regression is #746's second occurrence.
//
// Fields mirror what the quote endpoint actually prices: identity, quantity, unit price, and
// modifier selection. A change to any of them can change the discount, so any of them invalidates.
export const buildCartSignature = (cart) => (
  (Array.isArray(cart) ? cart : []).map((line) => [
    line?.cart_line_id || '',
    line?.item_id || '',
    Number(line?.quantity || 0),
    Number(line?.price || 0),
    Array.isArray(line?.line_modifiers)
      ? line.line_modifiers
        .map((entry) => `${entry?.modifier_group_id || ''}:${entry?.modifier_option_id || ''}:${entry?.quantity || 1}`)
        .join(',')
      : ''
  ].join(':')).join('|')
);

export default { buildCartSignature };

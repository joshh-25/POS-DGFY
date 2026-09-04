import React from 'react';
import { ChefHat, ChevronRight, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { resolveCartDiscountDisplay } from '../../../../shared/model/cartDiscountDisplay.js';
import { StorefrontCartQuantityInput } from '../../../../shared/components/storefront/StorefrontCartQuantityInput.jsx';

/**
 * F&B-owned cart drawer body. The storefront shell still owns the shared
 * drawer frame and the cart mutation APIs used by other storefront modes.
 */
export function FnbCartDrawerContent({
  cart,
  cartAddOnsTotal,
  cartCount,
  cartImageErrors,
  cartSubtotal,
  cartTotal,
  fnbOrderBrand,
  getLineTotal,
  goStoreCatalogPage,
  goStoreOrderPage,
  isDesktopCheckout,
  isMobileViewport,
  money,
  onEditCartLine,
  removeCartItem,
  renderPromoCodePanel,
  servicesBodyFont,
  setCartImageErrors,
  setIsCheckoutOpen,
  updateQty,
  promoDiscountAmount = 0,
  promoDiscountLabel = '',
  isQuoteStale = false,
  voucherDiscountAmount = 0,
}) {
  // #746 (second occurrence): the discount decision now lives in one shared helper instead of three
  // copies of this arithmetic. `isQuoteStale` compares the cart the quote was priced against to the
  // live cart -- a real validity test, unlike the old `!quoteNeedsRefresh` gate, which was the F&B
  // checkout-quote lifecycle flag and sat `true` in this drawer almost permanently, hiding the
  // discount outright. A stale discount is now shown and marked, not hidden; only a discount that
  // exceeds the cart is suppressed (RF-2's real concern -- never a confident PHP0 on a full cart).
  const {
    hasVoucherDiscount,
    hasPromoDiscount,
    displayTotal,
    isStale: isDiscountStale
  } = resolveCartDiscountDisplay({
    cartTotal,
    voucherDiscountAmount,
    promoDiscountAmount,
    isQuoteStale
  });
  return (              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: isDesktopCheckout ? 'calc(100vh - 126px)' : 'calc(92vh - 122px)' }}>
                <div data-storefront-cart-lines="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobileViewport ? '14px 16px 18px' : '16px 20px 18px', display: 'grid', gap: isMobileViewport ? 10 : 12, alignContent: 'start' }}>
                  {cart.length === 0 ? (
                    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 20, background: '#f8fafc', padding: '28px 20px', minHeight: isMobileViewport ? 240 : 320, textAlign: 'center', display: 'grid', alignContent: 'center', gap: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#1e293b' }}>No menu item added yet</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
                        Add food or beverage items from the catalog to continue to ordering.
                      </div>
                    </div>
                  ) : (
                    <>
                      {cart.map((line) => (
                        <div
                          key={`fnb-cart-line-${line.cart_line_id || line.item_id}`}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            padding: isMobileViewport ? '2px 0 12px' : '4px 0 14px',
                            display: 'grid',
                            gap: isMobileViewport ? 8 : 10
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '72px minmax(0, 1fr)' : '78px minmax(0, 1fr)', gap: isMobileViewport ? 12 : 14, alignItems: 'start' }}>
                            <div style={{ position: 'relative', width: isMobileViewport ? 72 : 78, height: isMobileViewport ? 72 : 78, borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              <div style={{ position: 'absolute', top: 6, right: 6, minWidth: 24, height: 24, padding: '0 7px', borderRadius: 999, background: '#f97316', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, boxShadow: '0 8px 18px rgba(249,115,22,0.18)', zIndex: 1 }}>
                                {Math.max(1, Number(line.quantity || 1))}
                              </div>
                              {(line.thumbnail_url || line.image_url) && !cartImageErrors.has(Number(line.item_id)) ? (
                                <StorefrontResponsiveImage
                                  imageSources={resolveStorefrontImageSources(line, { preferred: 'thumbnail' })}
                                  alt={line.name}
                                  sizes={isMobileViewport ? '72px' : '78px'}
                                  width={isMobileViewport ? 72 : 78}
                                  height={isMobileViewport ? 72 : 78}
                                  loading="lazy"
                                  decoding="async"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={() => {
                                    const normalizedLineItemId = Number(line.item_id);
                                    if (!Number.isFinite(normalizedLineItemId)) return;
                                    setCartImageErrors((previous) => {
                                      const next = new Set(previous);
                                      next.add(normalizedLineItemId);
                                      return next;
                                    });
                                  }}
                                />
                              ) : (
                                <ChefHat size={isMobileViewport ? 24 : 28} color="#cbd5e1" />
                              )}
                            </div>
                            <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'start', gap: 10 }}>
                                <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                                  <div style={{ fontSize: isMobileViewport ? 15 : 16, fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>
                                    {line.name}
                                  </div>
                                  <div style={{ fontSize: 12, color: '#64748b' }}>
                                    {line.unit_of_measure ? `Per ${line.unit_of_measure}` : 'Per serving'}
                                  </div>
                                </div>
                                <div style={{ fontSize: isMobileViewport ? 14 : 15, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                                  {money(getLineTotal(line))}
                                </div>
                                <button
                                  type="button"
                                  aria-label={`Remove ${line.name}`}
                                  onClick={() => removeCartItem(line.item_id, line.cart_line_id)}
                                  style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, alignSelf: 'center' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                              {Array.isArray(line.line_modifiers) && line.line_modifiers.length > 0 ? (
                                <div style={{ display: 'grid', gap: 6 }}>
                                  {line.line_modifiers.map((modifier, modifierIndex) => (
                                    <div
                                      key={`fnb-cart-line-${line.cart_line_id || line.item_id}-modifier-${modifierIndex}`}
                                      style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 8, alignItems: 'center', borderRadius: 12, border: '1px solid #bbf7d0', background: '#f0fdf4', padding: isMobileViewport ? '7px 10px' : '8px 10px' }}
                                    >
                                      <Plus size={14} color="#16a34a" />
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d', minWidth: 0 }}>
                                        {String(modifier.option_name || 'Add-on').trim() || 'Add-on'}{Number(modifier.quantity || 1) > 1 ? ` ×${Number(modifier.quantity)}` : ''}
                                      </span>
                                      <span style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', whiteSpace: 'nowrap' }}>
                                        +{money(Number(modifier.price_delta || 0) * Number(modifier.quantity || 1))}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {(line.has_modifier_groups === true || (Array.isArray(line.line_modifiers) && line.line_modifiers.length > 0)) ? (
                                <button
                                  type="button"
                                  aria-label={`Edit add-ons for ${line.name}`}
                                  onClick={() => onEditCartLine?.(line)}
                                  style={{
                                    justifySelf: 'start',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#15803d',
                                    padding: 0,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <Pencil size={13} />
                                  Edit add-ons
                                </button>
                              ) : null}
                              <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: 2 }}>
                                <div style={{ display: 'inline-grid', gridTemplateColumns: '32px 42px 32px', alignItems: 'center', justifyItems: 'center', borderRadius: 999, border: '1px solid #e2e8f0', background: '#ffffff', boxShadow: '0 4px 10px rgba(15,23,42,0.04)', padding: '2px 4px', gap: 4 }}>
                                  <button
                                    type="button"
                                    onClick={() => updateQty(line.item_id, Math.max(0, Number(line.quantity || 1) - 1), line.cart_line_id)}
                                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                                  >
                                    <Minus size={14} strokeWidth={2.5} />
                                  </button>
                                  <StorefrontCartQuantityInput
                                    itemId={line.item_id}
                                    lineName={line.name}
                                    cartLineId={line.cart_line_id}
                                    quantity={Math.max(1, Number(line.quantity || 1))}
                                    onUpdateQuantity={updateQty}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateQty(line.item_id, Number(line.quantity || 1) + 1, line.cart_line_id)}
                                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                                  >
                                    <Plus size={14} strokeWidth={2.5} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: isMobileViewport ? 14 : 16, paddingRight: isMobileViewport ? 16 : 20, paddingBottom: isMobileViewport ? 20 : 8, paddingLeft: isMobileViewport ? 16 : 20, display: 'grid', gap: 12, background: '#ffffff', boxShadow: '0 -12px 28px rgba(15,23,42,0.08)', zIndex: 2 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCheckoutOpen(false);
                      goStoreCatalogPage();
                      setTimeout(() => {
                        const el = document.getElementById('storefront-catalog-section');
                        if (el) {
                          const yOffset = -60; // Offset for sticky headers
                          const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
                          window.scrollTo({ top: y, behavior: 'smooth' });
                        }
                      }, 300);
                    }}
                    style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'center', width: '100%', borderRadius: 12, border: '1px solid #fed7aa', background: '#fff7ed', padding: isMobileViewport ? '10px 12px' : '10px 14px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #fdba74', background: '#fff', color: '#f97316', display: 'grid', placeItems: 'center' }}>
                      <Plus size={16} strokeWidth={2.5} />
                    </div>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Add more items</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Explore more meals and add-ons.</div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: '#f97316', whiteSpace: 'nowrap' }}>
                      Browse Menu
                      <ChevronRight size={14} strokeWidth={2.5} />
                    </div>
                  </button>
                  {renderPromoCodePanel({
                    compact: true,
                    accentColor: fnbOrderBrand,
                    bodyFont: servicesBodyFont,
                    isMobile: isMobileViewport
                  })}
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#475569' }}>
                      <span>Subtotal</span>
                      <span style={{ fontWeight: 700, color: '#334155' }}>{money(cartSubtotal)}</span>
                    </div>
                    {cartAddOnsTotal > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#475569' }}>
                        <span>Add-ons</span>
                        <span style={{ fontWeight: 700, color: '#334155' }}>{money(cartAddOnsTotal)}</span>
                      </div>
                    ) : null}
                    {hasPromoDiscount && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#15803d' }}>
                        <span>{promoDiscountLabel || 'Promo Discount'}</span>
                        <span style={{ fontWeight: 700 }}>- {money(promoDiscountAmount)}</span>
                      </div>
                    )}
                    {hasVoucherDiscount && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#15803d' }}>
                        <span>Voucher Discount</span>
                        <span style={{ fontWeight: 700 }}>- {money(voucherDiscountAmount)}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Total</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{cartCount} item{cartCount === 1 ? '' : 's'}</div>
                      {isDiscountStale && (
                <div style={{ fontSize: 12, color: '#b45309' }}>Updating total&hellip;</div>
              )}
                    </div>
                    <div style={{ fontSize: isMobileViewport ? 26 : 32, fontWeight: 900, color: '#0f172a', textAlign: 'right' }}>{money(displayTotal)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={goStoreOrderPage}
                    disabled={cart.length === 0}
                    style={{
                      minHeight: isMobileViewport ? 48 : 54,
                      borderRadius: 18,
                      border: 'none',
                      background: cart.length === 0 ? '#cbd5e1' : 'linear-gradient(135deg,#ea580c,#f97316)',
                      color: '#fff',
                      fontSize: isMobileViewport ? 16 : 16,
                      fontWeight: 900,
                      cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                      boxShadow: cart.length === 0 ? 'none' : '0 14px 30px rgba(234,88,12,.24)'
                    }}
                  >
                    Order &amp; Purchase
                  </button>
                </div>
              </div>  );
}

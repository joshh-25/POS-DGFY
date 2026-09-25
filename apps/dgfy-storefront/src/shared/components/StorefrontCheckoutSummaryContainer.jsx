import React from 'react';
import { DeliveryPinMap } from '../../features/locations/components/DeliveryPinMapLazy.jsx';
import { DGFY_ACRONYM, ORDER_METHOD_OPTIONS } from '../model/storefrontConstants.js';
import { StorefrontResponsiveImage } from './storefront/StorefrontResponsiveImage.jsx';
import { resolveStorefrontImageSources } from '../utils/storefrontImageSources.js';
import { buildDownpaymentTotalsRows, resolveDownpaymentDisplay } from '../model/storefrontDownpaymentPresentation.js';
import { resolveFulfillmentSelectorPresentation } from '../model/storefrontFulfillmentPresentation.js';
import {
  buildStorefrontOrderMethodOptions,
  resolveLocationFulfillmentSupport
} from '../model/storefrontOrderMethodOptions.js';

/**
 * Moved verbatim from `StorefrontApp.jsx`: the product/service checkout tab
 * body (customer/delivery details form, service intake fields, location pin,
 * order summary sidebar with quote/checkout buttons and totals). Previously
 * rendered inline inside the shell's checkout drawer under the
 * `checkoutTab === 'checkout'` guard, which the shell keeps along with its
 * mode-exclusion conditions. Placed in `shared/components/` since it only
 * imports shared components/constants, not anything mode-owned - `shared/`
 * must not import from `modes/*`.
 */
export function StorefrontCheckoutSummaryContainer({
  accessCapabilities,
  activeOrderMethodLabel,
  cart,
  cartCount,
  cartImageErrors,
  checkoutAllowed,
  checkoutError,
  checkoutLoading,
  checkoutPermitted,
  checkoutResult,
  customerAddress,
  customerEmail,
  customerName,
  customerPhone,
  customerPin,
  handleCheckout,
  handleDownloadCheckoutImage,
  handlePinMyLocation,
  handleQuote,
  hasServiceCart,
  hasStockViolation,
  isDeliveryOrder,
  isDesktopCheckout,
  isDgfyCustomerSignedIn,
  isFnbMode,
  money,
  orderMethod,
  pinLocationError,
  pinLocationLoading,
  quoteError,
  quoteNeedsRefresh,
  quoteResult,
  removeCartItem,
  renderGuestCheckoutEntry,
  renderStorefrontClosedNotice,
  selectedLocation,
  selectedLocationId,
  selectedStore,
  serviceAppointmentAt,
  serviceBookingStep,
  serviceIntakeFields,
  serviceIntakeResponses,
  servicePaymentOptions,
  servicePaymentTiming,
  servicesPrimary,
  setCartImageErrors,
  setCustomerAddress,
  setCustomerEmail,
  setCustomerName,
  setCustomerPhone,
  setCustomerPin,
  setOrderMethod,
  setPinLocationError,
  setSelectedLocationId,
  setServiceAppointmentAt,
  setServiceIntakeResponses,
  setServicePaymentTiming,
  storefrontClosedByHours,
  storeLocations,
  totalsForDisplay,
  updateQty,
}) {
  // Phase 142 (#823): quote-sourced only -- this container renders before a payment session
  // exists (it's the pre-checkout totals box, not a pending-payment or confirmation surface).
  const downpaymentDisplay = resolveDownpaymentDisplay({ quoteResult: totalsForDisplay });
  const orderMethodSelectOptions = buildStorefrontOrderMethodOptions(
    ORDER_METHOD_OPTIONS.filter((o) => o.value === 'delivery' || o.value === 'pickup'),
    resolveLocationFulfillmentSupport({ selectedStore, storeLocations, selectedLocationId })
  );
  const orderMethodSelectPresentation = resolveFulfillmentSelectorPresentation(orderMethodSelectOptions);
  const downpaymentRows = buildDownpaymentTotalsRows({ display: downpaymentDisplay, money, orderMethod });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.5fr) minmax(340px, 420px)' : '1fr', gap: 16, alignItems: 'start' }}>
      {isDgfyCustomerSignedIn ? (
      <section style={{ display: 'grid', gap: 14 }}>
        <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: '#ffffff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{hasServiceCart ? 'Customer Details' : 'Delivery Details'}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
            {hasServiceCart
              ? 'Finish the booking with the customer contact details required by the current storefront contract.'
              : 'Group the must-fill fields together so checkout feels faster and calmer.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
            {storeLocations.length > 0 && (
              <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                Fulfillment Location
                <select
                  value={selectedLocationId ?? ''}
                  onChange={(e) => setSelectedLocationId(e.target.value ? Number(e.target.value) : null)}
                  style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                >
                  {storeLocations.map((location) => (
                    <option key={location.location_id} value={location.location_id} disabled={location.is_open === false || location.is_active === false}>
                      {location.name} {location.is_primary_storefront ? '(Primary)' : ''} {location.is_open === false ? '(Closed)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!hasServiceCart && (
              /* #1093: narrowed to the ecommerce fulfillment axis (delivery/pickup) and to what
                 the resolved fulfillment location actually supports -- this raw <select>
                 previously offered all four ORDER_METHOD_OPTIONS unconditionally, including
                 dine_in/takeout, which never belong on a storefront checkout.
                 #1217: and when only one of the two survives that narrowing there is nothing to
                 choose, so the <select> is replaced by a read-only statement of the method. */
              orderMethodSelectPresentation.showSelector ? (
              <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                Order Method
                <select
                  value={orderMethod}
                  onChange={(e) => {
                    setOrderMethod(e.target.value);
                    setPinLocationError('');
                  }}
                  style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                >
                  {orderMethodSelectOptions.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.available === false}>
                      {o.label}{o.available === false ? ' (Unavailable)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              ) : (
                <div style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                  Order Method
                  <div data-testid="checkout-summary-order-method-notice" style={{ marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#f8fafc', fontSize: 13, fontWeight: 600, color: '#334155' }}>
                    {orderMethodSelectPresentation.soleOption?.label || 'Not available'}
                  </div>
                </div>
              )
            )}
            <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
              Customer Name
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Who is receiving this?" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
            </label>
            <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
              Phone Number
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Mobile number" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
            </label>
            <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
              Email
              <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="For ticket or account linking" style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
            </label>
          </div>
          {hasServiceCart && (
            <>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                  Appointment Date / Time
                  <input type="datetime-local" value={serviceAppointmentAt} onChange={(e) => setServiceAppointmentAt(e.target.value)} style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }} />
                </label>
                <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                  Payment Timing
                  <select value={servicePaymentTiming} onChange={(e) => setServicePaymentTiming(e.target.value)} style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}>
                    {servicePaymentOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {serviceIntakeFields.length > 0 && (
                <section style={{ marginTop: 10, border: '1px solid #d9e4e8', borderRadius: 14, padding: 12, background: '#f8fafc' }}>
                  <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Service Intake</h3>
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10 }}>
                    {serviceIntakeFields.map((field) => (
                      <label key={field.id} style={{ display: 'block', fontSize: 12, color: '#475569' }}>
                        {field.label}{field.required ? ' *' : ''}
                        {field.type === 'textarea' ? (
                          <textarea
                            value={serviceIntakeResponses[field.id] || ''}
                            onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            style={{ width: '100%', minHeight: 72, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                          />
                        ) : field.type === 'select' ? (
                          <select
                            value={serviceIntakeResponses[field.id] || ''}
                            onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                          >
                            <option value="">Select</option>
                            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        ) : field.type === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={serviceIntakeResponses[field.id] === true}
                            onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.checked }))}
                            style={{ marginTop: 10 }}
                          />
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                            value={serviceIntakeResponses[field.id] || ''}
                            onChange={(e) => setServiceIntakeResponses((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff' }}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {!hasServiceCart && (
            <label style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 10 }}>
              Delivery Address
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder={isDeliveryOrder ? 'House number, street, landmark' : 'Address is only needed for delivery'}
                disabled={!isDeliveryOrder}
                style={{ width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: isDeliveryOrder ? '#fff' : '#f1f5f9' }}
              />
            </label>
          )}
          {selectedLocation?.is_open === false && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
              Selected location is closed and cannot accept orders right now.
            </div>
          )}
        </div>
  
        {!hasServiceCart && (
          <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 14, background: 'linear-gradient(180deg,#f8fffe 0%,#ffffff 100%)', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Location Pin</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {isDeliveryOrder ? 'Add a precise drop-off pin to help fulfillment.' : 'Pinning is available for delivery orders.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handlePinMyLocation}
                  disabled={!isDeliveryOrder || pinLocationLoading}
                  style={{ borderRadius: 12, border: '1px solid #0f766e', background: isDeliveryOrder ? '#fff' : '#f8fafc', color: '#0f766e', padding: '9px 12px', fontWeight: 700, cursor: isDeliveryOrder ? 'pointer' : 'not-allowed' }}
                >
                  {pinLocationLoading ? 'Pinning...' : 'Pin My Location'}
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerPin(null)}
                  disabled={!isDeliveryOrder || !customerPin}
                  style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '9px 12px', fontWeight: 700, cursor: (!isDeliveryOrder || !customerPin) ? 'not-allowed' : 'pointer' }}
                >
                  Clear Pin
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 10, fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
              {isDeliveryOrder
                ? (customerPin
                  ? `Pinned at ${Number(customerPin.latitude).toFixed(6)}, ${Number(customerPin.longitude).toFixed(6)}`
                  : 'No pin selected yet. Tap the map or use your current location.')
                : 'Switch order method to Delivery if you want to save a location pin.'}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <DeliveryPinMap
                pin={customerPin}
                onPinChange={setCustomerPin}
                disabled={!isDeliveryOrder}
              />
              {pinLocationError && <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</p>}
            </div>
          </div>
        )}
      </section>
      ) : renderGuestCheckoutEntry({
        title: hasServiceCart ? 'Continue to your booking' : 'Continue to your order',
        description: hasServiceCart
          ? 'Create an account or continue as guest to continue this booking.'
          : 'Create an account or continue as guest to continue this order.',
        resumeTarget: {
          checkoutTab: 'checkout',
          serviceBookingStep: hasServiceCart ? 1 : serviceBookingStep
        }
      })}
  
      <section style={{ display: 'grid', gap: 12, position: isDesktopCheckout ? 'sticky' : 'static', top: 0 }}>
        <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 14, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{isFnbMode ? 'Cart Summary' : 'Order Summary'}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {isFnbMode ? 'Update quantities, then refresh the quote before checkout.' : 'Keep the total visible while editing.'}
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{cartCount} item{cartCount === 1 ? '' : 's'}</div>
          </div>
          <div style={{ maxHeight: isDesktopCheckout ? 320 : 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 16, padding: 10, marginTop: 12, background: '#fbfeff' }}>
            {cart.length === 0 && (
              <p style={{ margin: 0, color: '#64748b' }}>
                {isFnbMode ? 'Your menu cart is empty. Add items from Menu Highlights to start an order.' : 'Cart is empty.'}
              </p>
            )}
            {cart.map((line) => (
              <div key={line.item_id} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 78px 96px', gap: 10, alignItems: 'center', marginBottom: 10, padding: 10, border: '1px solid #e6edf2', borderRadius: 14, background: '#fff' }}>
                <div style={{ width: 58, height: 58, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: 'linear-gradient(135deg,#f8fafc,#eef2f7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(line.thumbnail_url || line.image_url) && !cartImageErrors.has(Number(line.item_id)) ? (
                    <StorefrontResponsiveImage
                      imageSources={resolveStorefrontImageSources(line, { preferred: 'thumbnail' })}
                      alt={line.name}
                      sizes="58px"
                      width={58}
                      height={58}
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={() => {
                        const normalizedLineItemId = Number(line.item_id);
                        if (!Number.isFinite(normalizedLineItemId)) return;
                        setCartImageErrors((prev) => {
                          const next = new Set(prev);
                          next.add(normalizedLineItemId);
                          return next;
                        });
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: 'center', padding: 6 }}>No Image</span>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{line.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Unit: {money(line.price)} {line.unit_of_measure ? `- ${line.unit_of_measure}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#0f766e', fontWeight: 700 }}>
                    {line.category === 'service' ? 'Bookable appointment' : `${activeOrderMethodLabel} order item`}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCartItem(line.item_id)}
                    style={{ marginTop: 6, border: 'none', background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>
                <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateQty(line.item_id, e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '8px 10px', background: '#fff', fontWeight: 700 }} />
                <span style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{money(line.quantity * line.price)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#1d8f86)', color: '#fff', padding: 14 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, opacity: .95 }}>Items Subtotal</span>
                <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.subtotal_amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, opacity: .95 }}>{totalsForDisplay.service_fee_label} (1%)</span>
                <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.service_fee_amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, opacity: .95 }}>Delivery Fee</span>
                <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.delivery_fee)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, opacity: .95 }}>Vatable Sales</span>
                <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vatable_sales)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, opacity: .95 }}>VAT Amount</span>
                <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, opacity: .95 }}>VAT-Exempt Sales</span>
                <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.vat_exempt_sales)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, opacity: .95 }}>Zero-Rated Sales</span>
                <strong style={{ fontSize: 14 }}>{money(totalsForDisplay.zero_rated_sales)}</strong>
              </div>
              <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.24)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>Total Amount Due</span>
                <strong style={{ fontSize: 22 }}>{money(totalsForDisplay.total_amount)}</strong>
              </div>
              {downpaymentRows.map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, opacity: .95, fontWeight: row.emphasis ? 800 : 400 }}>{row.label}</span>
                  <strong style={{ fontSize: 14 }}>{row.value}</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, opacity: .95 }}>
              {hasServiceCart
                ? 'Service booking totals are estimated from the selected service. Complete appointment details to book.'
                : quoteResult
                  ? (quoteNeedsRefresh ? 'Displayed totals are stale. Click Quote again to re-sync and unlock checkout.' : 'Totals are synced from the latest quote and checkout is enabled.')
                  : 'No quote yet. Click Quote to unlock checkout.'}
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {!hasServiceCart && checkoutPermitted && accessCapabilities.quote !== false && (
                <button type="button" onClick={handleQuote} disabled={!selectedStore || cart.length === 0} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.55)', background: '#ffffff', color: '#0f766e', padding: '11px 12px', fontWeight: 800 }}>{isFnbMode ? 'Refresh Quote' : 'Quote'}</button>
              )}
              <button type="button" onClick={handleCheckout} disabled={!checkoutAllowed} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.2)', background: '#0b3d3a', color: '#fff', padding: '11px 12px', fontWeight: 800 }}>{checkoutLoading ? 'Processing...' : (hasServiceCart ? 'Submit Booking' : (isFnbMode ? 'Place Order' : 'Checkout'))}</button>
            </div>
          </div>
          {hasStockViolation && (
            <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>
              Cannot checkout: one or more lines exceed current stock.
            </p>
          )}
          {!hasServiceCart && !quoteResult && cart.length > 0 && (
            <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
              Quote is required before checkout.
            </p>
          )}
          {!hasServiceCart && quoteResult && quoteNeedsRefresh && (
            <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
              Cart changed after quote. Click Quote again to proceed.
            </p>
          )}
          {hasServiceCart && !serviceAppointmentAt && (
            <p style={{ marginTop: 10, fontSize: 13, color: '#b45309', fontWeight: 700 }}>
              Choose an appointment date and time before booking.
            </p>
          )}
          {quoteError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{quoteError}</p>}
          {!hasServiceCart && quoteResult && (
            <p style={{ marginTop: 10, fontSize: 13, color: '#0f766e' }}>
              {downpaymentDisplay.active
                ? `Quote synced. Downpayment due now: ${money(downpaymentDisplay.downpaymentAmount)}`
                : `Quote synced. Total due: ${money(totalsForDisplay.total_amount)}`}
            </p>
          )}
          {storefrontClosedByHours && renderStorefrontClosedNotice({ accent: servicesPrimary, background: '#eff6ff', border: '#bfdbfe' })}
          {checkoutError && <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
          {(checkoutResult?.tracking_pin || checkoutResult?.booking?.public_reference) && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8, border: '1px solid #99f6e4', background: '#ecfeff', borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#0f766e' }}>
                {checkoutResult?.booking ? 'Booking created.' : 'Order placed.'} Reference: <strong>{checkoutResult.booking?.public_reference || checkoutResult.tracking_pin}</strong>
              </p>
              {checkoutResult?.account_action?.show_signup === true && (
                <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>
                  You can sign in or register to save this latest transaction to your account.
                </p>
              )}
              {checkoutResult?.payment?.checkout_url && (
                <a href={checkoutResult.payment.checkout_url} target="_blank" rel="noreferrer" style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 12px', fontWeight: 800, textDecoration: 'none' }}>
                  Pay Now
                </a>
              )}
              {checkoutResult?.account_action?.show_signup !== true && (
                <p style={{ margin: 0, fontSize: 12, color: '#0f766e' }}>
                  This ticket can be kept as an image for your gallery.
                </p>
              )}
              <button type="button" onClick={handleDownloadCheckoutImage} style={{ justifySelf: 'start', borderRadius: 10, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 800 }}>
                Download Image
              </button>
            </div>
          )}
          <p style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>{DGFY_ACRONYM}</p>
        </div>
      </section>
    </div>
  );
}

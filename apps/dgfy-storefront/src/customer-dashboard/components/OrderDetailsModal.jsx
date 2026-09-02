import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  CreditCard,
  MapPin,
  Package,
  Receipt,
  Truck,
  X
} from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

const getDisplaySnapshot = (order) => order?.display || order?.display_snapshot || {};

const getOrderLines = (order) => {
  const display = getDisplaySnapshot(order);
  if (Array.isArray(display.lines) && display.lines.length > 0) return display.lines;
  if (Array.isArray(order?.summary_lines) && order.summary_lines.length > 0) return order.summary_lines;
  return [];
};

const getLineAmount = (line) => {
  const directAmount = toFiniteNumber(line?.line_total_amount ?? line?.line_total ?? line?.amount);
  if (directAmount !== null) return directAmount;
  const unitPrice = toFiniteNumber(line?.price ?? line?.unit_price ?? line?.unit_price_snapshot);
  const quantity = toFiniteNumber(line?.quantity ?? line?.qty);
  return unitPrice !== null && quantity !== null ? unitPrice * quantity : null;
};

const DetailItem = ({ icon: Icon, label, value, theme, spanFullWidth = false }) => {
  if (!value) return null;
  return (
    <div data-testid={`order-details-information-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0, gridColumn: spanFullWidth ? '1 / -1' : undefined }}>
      <Icon size={16} color={theme.primary} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.muted, fontWeight: 600 }}>{label}</div>
        <div style={{ marginTop: 3, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.text, overflowWrap: 'anywhere' }}>{value}</div>
      </div>
    </div>
  );
};

export function OrderDetailsModal({
  order,
  isMobileViewport,
  onClose,
  onTrack,
  isLoading = false,
  error = '',
  warning = '',
  onRetry,
  isTracking,
  formatDate,
  money,
  prettyStatus,
  getStoreLogoUrl,
  theme
}) {
  const [showPaymentBreakdown, setShowPaymentBreakdown] = useState(false);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const isOpen = Boolean(order);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
      return undefined;
    }

    returnFocusRef.current = document.activeElement && typeof document.activeElement.focus === 'function'
      ? document.activeElement
      : null;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusableElements = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    const focusFrame = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(() => closeButtonRef.current?.focus())
      : null;
    return () => {
      if (focusFrame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    };
  }, [isOpen]);

  if (!order) return null;

  const display = getDisplaySnapshot(order);
  const lines = getOrderLines(order);
  const storeName = order.store_name || 'DGFY Store';
  const reference = order.reference || 'Unavailable';
  const logoUrl = getStoreLogoUrl(order);
  const orderMethod = display.order_method || order.order_method;
  const receiptNumber = display.receipt_number || order.receipt_number || order.invoice_number;
  const paymentStatus = order.payment_status || display.payment_status;
  const deliveryAddress = display.delivery_address || order.delivery_address || order.customer_address;
  const scheduledFor = display.scheduled_for || order.scheduled_for;
  const subtotal = order.subtotal_amount ?? display.subtotal_amount;
  const deliveryFee = order.delivery_fee ?? display.delivery_fee;
  const serviceFee = order.service_fee ?? order.service_fee_amount ?? display.service_fee;
  const discountAmount = order.discount_amount ?? display.discount_amount;
  const orderStatus = order.status_label || order.status;
  const placedDate = formatDate(order.occurred_at);
  const scheduleLabel = scheduledFor && formatDate(scheduledFor)
    ? `${formatDate(scheduledFor)}${formatTime(scheduledFor) ? `, ${formatTime(scheduledFor)}` : ''}`
    : scheduledFor;
  const itemListMaxHeight = isMobileViewport ? 196 : 248;
  const totalValue = toFiniteNumber(order.total_amount) !== null ? money(order.total_amount) : 'Unavailable';
  const sectionHeadingStyle = {
    margin: 0,
    fontSize: isMobileViewport ? 16 : 18,
    fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitleWeight,
    lineHeight: 1.25,
    color: theme.text
  };
  const totalRows = [
    { label: 'Subtotal', value: subtotal },
    { label: 'Delivery fee', value: deliveryFee },
    { label: 'Service fee', value: serviceFee },
    ...(toFiniteNumber(discountAmount) !== null ? [{ label: 'Discount', value: -Math.abs(Number(discountAmount)) }] : [])
  ].filter((row) => toFiniteNumber(row.value) !== null);
  const disclosureIconStyle = {
    flexShrink: 0,
    color: theme.muted,
    transform: 'rotate(0deg)'
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2590,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'grid',
        alignItems: isMobileViewport ? 'end' : 'center',
        justifyItems: 'center',
        padding: isMobileViewport ? 0 : 20
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dgfy-order-details-title"
        style={{
          width: 'min(640px, 100%)',
          maxHeight: isMobileViewport ? 'calc(100vh - 12px)' : 'calc(100vh - 40px)',
          overflow: 'hidden',
          background: theme.surface,
          borderRadius: isMobileViewport ? '18px 18px 0 0' : 18,
          border: `1px solid ${theme.border}`,
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)',
          padding: isMobileViewport ? 18 : 24,
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          boxSizing: 'border-box'
        }}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: theme.infoBg, color: theme.info, display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {logoUrl ? <img src={logoUrl} alt={`${storeName} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={22} aria-hidden="true" />}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 id="dgfy-order-details-title" style={{ margin: 0, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitle, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitleWeight, color: theme.text }}>Order details</h2>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 3, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.muted }}>
                <span style={{ overflowWrap: 'anywhere' }}>{storeName} · #{reference}</span>
                {placedDate ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><CalendarDays size={15} color={theme.primary} aria-hidden="true" />Placed {placedDate}</span> : null}
              </div>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close order details" style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.muted, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div data-testid="order-details-scroll-region" style={{ minHeight: 0, overflowY: 'auto', display: 'grid', gap: 16, paddingRight: isMobileViewport ? 0 : 4 }}>
          <section data-testid="order-details-information-section" aria-labelledby="dgfy-order-information-title" style={{ display: 'grid', gap: 10 }}>
            <h3 id="dgfy-order-information-title" style={sectionHeadingStyle}>Order information</h3>
            <div id="dgfy-order-information-content" data-testid="order-details-information-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, padding: 14, borderRadius: 12, background: theme.bg, border: `1px solid ${theme.border}` }}>
              <DetailItem icon={Clock3} label="Order time" value={formatTime(order.occurred_at)} theme={theme} />
              <DetailItem icon={Truck} label="Order method" value={orderMethod ? prettyStatus(orderMethod) : null} theme={theme} />
              <DetailItem icon={Receipt} label="Receipt / check" value={receiptNumber} theme={theme} />
              <DetailItem icon={CreditCard} label="Payment" value={paymentStatus ? prettyStatus(paymentStatus) : null} theme={theme} />
              <DetailItem icon={MapPin} label="Delivery address" value={deliveryAddress} theme={theme} spanFullWidth={isMobileViewport} />
              <DetailItem icon={CalendarDays} label="Scheduled for" value={scheduleLabel} theme={theme} />
              <DetailItem icon={Package} label="Status" value={orderStatus ? prettyStatus(orderStatus) : null} theme={theme} />
            </div>
          </section>

          <section data-testid="order-details-items-section" aria-labelledby="dgfy-order-items-title" style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h3 id="dgfy-order-items-title" style={sectionHeadingStyle}>Items</h3>
              {lines.length > 0 ? <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.muted }}>{lines.length} {lines.length === 1 ? 'item' : 'items'}</span> : null}
            </div>
            {isLoading ? (
              <div role="status" aria-live="polite" style={{ minHeight: 64, display: 'grid', alignItems: 'center', padding: 14, borderRadius: 10, background: theme.bg, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>
                Loading complete order details…
              </div>
            ) : (
              <>
                {warning ? <div role="status" aria-live="polite" style={{ padding: 12, borderRadius: 10, background: theme.infoBg, color: theme.info, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>{warning}</div> : null}
                {error ? (
                  <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 12, borderRadius: 10, background: '#FEF2F2', color: '#B42318', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{error}</span>
                    {typeof onRetry === 'function' ? <button type="button" onClick={onRetry} style={{ minHeight: isMobileViewport ? 44 : 36, padding: '0 12px', borderRadius: 8, border: '1px solid #FCA5A5', background: theme.surface, color: '#B42318', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Try again</button> : null}
                  </div>
                ) : null}
                {lines.length > 0 ? (
                  <>
                    <div data-testid="order-details-items-scroll" role={lines.length > 3 ? 'region' : undefined} aria-label={lines.length > 3 ? 'Scrollable order items' : undefined} tabIndex={lines.length > 3 ? 0 : undefined} style={{ maxHeight: itemListMaxHeight, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
                      <div data-testid="order-details-items" style={{ display: 'grid', gap: 0, borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>
                        {lines.map((line, index) => {
                          const quantity = toFiniteNumber(line?.quantity ?? line?.qty) || 1;
                          const amount = getLineAmount(line);
                          const name = line?.name || line?.label || 'Item';
                          return (
                            <div key={`${name}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '10px 0', borderBottom: index === lines.length - 1 ? 'none' : `1px solid ${theme.border}` }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, fontWeight: 700, lineHeight: 1.4, color: theme.text, overflowWrap: 'anywhere' }}>{name}</div>
                                <div style={{ marginTop: 3, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.muted }}>Qty {quantity}{line?.unit_of_measure ? ` · ${line.unit_of_measure}` : ''}</div>
                              </div>
                              {amount !== null ? <strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.text, whiteSpace: 'nowrap' }}>{money(amount)}</strong> : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : <div style={{ padding: 14, borderRadius: 10, background: theme.bg, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>Item details are not available in this account snapshot.</div>}
              </>
            )}
          </section>

          <section data-testid="order-details-payment-section" aria-labelledby="dgfy-order-total-title" style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8, columnGap: 14 }}>
              <h3 id="dgfy-order-total-title" style={sectionHeadingStyle}>Payment summary</h3>
              <div data-testid="order-details-total-and-breakdown" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
                <strong style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.metric.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.metric.desktop, color: theme.text, whiteSpace: 'nowrap' }}>{totalValue}</strong>
                {totalRows.length > 0 ? <button
                  type="button"
                  onClick={() => setShowPaymentBreakdown((current) => !current)}
                  aria-label={showPaymentBreakdown ? 'Hide payment breakdown' : 'View payment breakdown'}
                  title={showPaymentBreakdown ? 'Hide payment breakdown' : 'View payment breakdown'}
                  aria-expanded={showPaymentBreakdown}
                  aria-controls="dgfy-order-payment-breakdown"
                  style={{ width: isMobileViewport ? 40 : 36, height: isMobileViewport ? 40 : 36, display: 'grid', placeItems: 'center', padding: 0, border: `1px solid ${theme.border}`, borderRadius: 9, background: theme.surface, color: theme.primary, cursor: 'pointer', flexShrink: 0 }}
                >
                  <ChevronDown size={18} aria-hidden="true" style={{ ...disclosureIconStyle, color: theme.primary, transform: showPaymentBreakdown ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button> : null}
              </div>
            </div>
            {totalRows.length > 0 ? <>
              {showPaymentBreakdown ? <div id="dgfy-order-payment-breakdown" style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 10, background: theme.bg, border: `1px solid ${theme.border}` }}>
                {totalRows.map((row) => <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: row.label === 'Discount' ? theme.success : theme.muted }}><span>{row.label}</span><span>{row.label === 'Discount' ? `- ${money(Math.abs(Number(row.value)))}` : money(row.value)}</span></div>)}
              </div> : null}
            </> : null}
          </section>
        </div>

        <footer style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'auto auto', justifyContent: 'flex-end', gap: 10, paddingTop: 12, marginTop: 12, borderTop: `1px solid ${theme.border}`, background: theme.surface }}>
          <button type="button" onClick={onClose} style={{ width: isMobileViewport ? '100%' : undefined, minHeight: isMobileViewport ? 44 : 40, padding: '0 16px', borderRadius: 9, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer' }}>Close</button>
          <button type="button" onClick={() => onTrack(order)} disabled={isTracking} style={{ width: isMobileViewport ? '100%' : undefined, minHeight: isMobileViewport ? 44 : 40, padding: '0 18px', borderRadius: 9, border: `1px solid ${theme.primary}`, background: theme.primary, color: '#FFF', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: isTracking ? 'wait' : 'pointer' }}>{isTracking ? 'Loading...' : 'Track Order'}</button>
        </footer>
      </div>
    </div>
  );
}

import React from 'react';
import { CalendarDays, ChevronRight, Clock3, Package } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const formatTransactionTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

const hasFiniteAmount = (value) => value !== null
  && value !== undefined
  && value !== ''
  && Number.isFinite(Number(value));

export function CustomerTransactionCard({
  testId = 'customer-transaction-card',
  ariaLabel,
  entry,
  storeName = 'DGFY Store',
  reference = '',
  logoUrl = '',
  logoAlt,
  occurredAt,
  status,
  totalAmount,
  totalLabel = 'Total Amount',
  totalValue = 'Unavailable',
  formatDate,
  money,
  isMobileViewport,
  theme,
  StatusBadge,
  FallbackIcon = Package,
  onOpenStorefront,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryDisabled = false,
  secondaryLoadingLabel,
  primaryActionLabel,
  onPrimaryAction,
  primaryDisabled = false,
  primaryLoadingLabel,
  reviewActionLabel,
  onReviewAction
}) {
  const transactionTime = formatTransactionTime(occurredAt);
  const hasAmount = hasFiniteAmount(totalAmount);
  const actionButtonStyle = {
    minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop,
    padding: '0 14px',
    borderRadius: 8,
    fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flex: isMobileViewport ? '1 1 0' : '0 0 auto'
  };
  const storeIdentity = (
    <>
      {logoUrl ? <img src={logoUrl} alt={logoAlt || `${storeName} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <FallbackIcon size={isMobileViewport ? 26 : 22} aria-hidden="true" />}
    </>
  );
  const openStorefront = typeof onOpenStorefront === 'function';
  const identityButtonStyle = {
    width: isMobileViewport ? 56 : 44,
    height: isMobileViewport ? 56 : 44,
    borderRadius: 13,
    background: theme.infoBg,
    color: theme.info,
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    border: 'none',
    padding: 0,
    cursor: openStorefront ? 'pointer' : 'default',
    flexShrink: 0
  };
  const identity = openStorefront ? (
    <button type="button" onClick={() => onOpenStorefront(entry || { reference, store_name: storeName })} aria-label={`Open ${storeName}`} style={identityButtonStyle}>
      {storeIdentity}
    </button>
  ) : <div aria-hidden="true" style={identityButtonStyle}>{storeIdentity}</div>;
  const name = openStorefront ? (
    <button type="button" onClick={() => onOpenStorefront(entry || { reference, store_name: storeName })} style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 700, color: theme.text, margin: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
      {storeName}
    </button>
  ) : <div style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 700, color: theme.text }}>{storeName}</div>;
  const secondaryAction = secondaryActionLabel && typeof onSecondaryAction === 'function' ? (
    <button type="button" onClick={onSecondaryAction} disabled={secondaryDisabled} style={{ ...actionButtonStyle, background: theme.surface, border: `1px solid ${theme.primary}`, color: theme.primary, cursor: secondaryDisabled ? 'wait' : 'pointer' }}>
      {secondaryDisabled && secondaryLoadingLabel ? secondaryLoadingLabel : secondaryActionLabel}
    </button>
  ) : null;
  const primaryAction = primaryActionLabel && typeof onPrimaryAction === 'function' ? (
    <button type="button" onClick={onPrimaryAction} disabled={primaryDisabled} style={{ ...actionButtonStyle, background: theme.primary, border: `1px solid ${theme.primary}`, color: '#FFF', cursor: primaryDisabled ? 'wait' : 'pointer' }}>
      {primaryDisabled && primaryLoadingLabel ? primaryLoadingLabel : primaryActionLabel}
    </button>
  ) : null;
  const reviewAction = reviewActionLabel && typeof onReviewAction === 'function' ? (
    <button type="button" onClick={onReviewAction} style={{ ...actionButtonStyle, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.primary, width: isMobileViewport ? '100%' : 'auto' }}>
      {reviewActionLabel}
    </button>
  ) : null;

  return (
    <article
      data-testid={testId}
      aria-label={ariaLabel || `${storeName} transaction ${reference}`}
      style={{
        background: theme.surface,
        borderRadius: isMobileViewport ? 15 : 12,
        border: `1px solid ${theme.border}`,
        boxShadow: '0 2px 8px rgba(16, 24, 40, 0.04)',
        padding: 18,
        display: 'grid',
        gridTemplateColumns: isMobileViewport
          ? '1fr'
          : 'minmax(220px, 1.2fr) minmax(150px, 0.85fr) minmax(150px, 0.85fr) minmax(250px, auto)',
        gap: isMobileViewport ? 16 : 0,
        alignItems: 'center'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobileViewport ? 'space-between' : 'flex-start', gap: 12, minWidth: 0, paddingRight: isMobileViewport ? 0 : 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {identity}
          <div style={{ minWidth: 0 }}>
            {name}
            <div style={{ marginTop: 5, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.muted }}>#{reference}</div>
          </div>
        </div>
        {isMobileViewport ? <StatusBadge status={status} /> : null}
      </div>

      <div style={{ display: isMobileViewport ? 'grid' : 'contents', gridTemplateColumns: isMobileViewport ? 'minmax(0, 1fr) auto' : undefined, minWidth: 0 }}>
        <div data-testid="customer-transaction-date-time" style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'minmax(0, 1fr)' : undefined, alignItems: 'center', gap: isMobileViewport ? 6 : 7, minWidth: 0, padding: isMobileViewport ? '14px 0 0' : '0 20px', color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, borderLeft: isMobileViewport ? 'none' : `1px solid ${theme.border}`, borderTop: isMobileViewport ? `1px solid ${theme.border}` : 'none', whiteSpace: 'nowrap' }}>
          <div data-testid="customer-transaction-date" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <CalendarDays size={15} color={theme.primary} aria-hidden="true" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatDate(occurredAt)}</span>
          </div>
          {transactionTime ? (
            <div data-testid="customer-transaction-time" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock3 size={15} color={theme.primary} aria-hidden="true" />
              <span>{transactionTime}</span>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 7, justifyItems: 'end', minWidth: 0, padding: isMobileViewport ? '14px 0 0' : '0 20px', borderLeft: isMobileViewport ? 'none' : `1px solid ${theme.border}`, borderTop: isMobileViewport ? `1px solid ${theme.border}` : 'none', textAlign: 'right' }}>
          <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.muted, fontWeight: 600 }}>{hasAmount ? totalLabel : 'Type'}</span>
          <strong style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.metric.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.metric.desktop, lineHeight: 1.1, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{hasAmount ? money(totalAmount) : totalValue}</strong>
          {!isMobileViewport ? <StatusBadge status={status} /> : null}
        </div>
      </div>

      <div style={{ display: isMobileViewport ? 'grid' : 'flex', gridTemplateColumns: isMobileViewport ? (secondaryAction ? 'repeat(2, minmax(0, 1fr))' : '1fr') : undefined, gap: 10, flexWrap: isMobileViewport ? undefined : 'wrap', width: isMobileViewport ? '100%' : 'auto', justifyContent: isMobileViewport ? 'stretch' : 'flex-end', alignItems: 'center', padding: isMobileViewport ? '14px 0 0' : '0 0 0 20px', borderLeft: isMobileViewport ? 'none' : `1px solid ${theme.border}`, borderTop: isMobileViewport ? `1px solid ${theme.border}` : 'none' }}>
        {secondaryAction}
        {primaryAction}
        {reviewAction}
        <ChevronRight size={19} color={theme.primary} aria-hidden="true" style={{ display: isMobileViewport ? 'none' : 'block', flexShrink: 0, marginLeft: 2 }} />
      </div>
    </article>
  );
}

export default CustomerTransactionCard;

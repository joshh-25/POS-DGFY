import React from 'react';
import { ChevronRight } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function CustomerAccountDetailRow({
  isMobileViewport,
  theme,
  icon: Icon,
  title,
  value,
  description = '',
  statusLabel,
  statusTone = 'neutral',
  actionLabel,
  onAction
}) {
  const statusStyles = statusTone === 'verified'
    ? { background: '#e6f4ea', color: '#137333' }
    : statusTone === 'warning'
      ? { background: '#fff3e0', color: '#b45309' }
      : { background: '#f1f5f9', color: theme.muted };

  return (
    <div
      data-testid={`customer-account-detail-${title.toLowerCase().replace(/\s+/g, '-')}`}
      style={{
        display: 'flex',
        alignItems: isMobileViewport ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: isMobileViewport ? '12px 10px' : '12px 14px',
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        minWidth: 0,
        flexWrap: 'wrap'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 240px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, fontWeight: 800 }}>{title}</div>
          <div style={{ color: description ? theme.muted : theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: description ? 500 : 700, marginTop: 3, overflowWrap: 'anywhere' }}>
            {description || value}
          </div>
          {description && <div style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 700, marginTop: 2, overflowWrap: 'anywhere' }}>{value}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: isMobileViewport ? 48 : 0, flex: isMobileViewport ? '1 1 100%' : '0 0 auto', justifyContent: isMobileViewport ? 'space-between' : 'flex-end', minWidth: 0 }}>
        {statusLabel && <span style={{ ...statusStyles, display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 6, padding: '4px 7px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, fontWeight: 800, whiteSpace: 'nowrap' }}>{statusLabel}</span>}
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: 0, background: 'transparent', color: theme.primary, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 4px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            aria-label={`${actionLabel} ${title}`}
          >
            {actionLabel} <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

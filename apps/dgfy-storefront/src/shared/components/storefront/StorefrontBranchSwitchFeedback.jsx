import React from 'react';

export function StorefrontBranchSwitchFeedback({ branchName = '' }) {
  const normalizedBranchName = String(branchName || '').trim();
  if (!normalizedBranchName) return null;

  return (
    <div
      data-testid="storefront-branch-switch-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4990,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        boxSizing: 'border-box',
        background: 'rgba(15, 23, 42, 0.12)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        pointerEvents: 'auto'
      }}
    >
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          maxWidth: 'calc(100vw - 32px)',
          minWidth: 236,
          justifyContent: 'center',
          padding: '14px 18px',
          boxSizing: 'border-box',
        border: '1px solid rgba(26, 78, 141, 0.2)',
        borderRadius: 16,
        background: 'rgba(255, 255, 255, 0.98)',
        boxShadow: '0 16px 38px rgba(15, 23, 42, 0.2)',
        color: '#1a4e8d',
        fontSize: 14,
        fontWeight: 700,
          pointerEvents: 'none'
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            flex: '0 0 auto',
            border: '2px solid #dbeafe',
            borderTopColor: '#1a4e8d',
            borderRadius: '999px',
            animation: 'storefrontCatalogRefreshSpin 0.8s linear infinite'
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Switching to {normalizedBranchName}…
        </span>
      </div>
    </div>
  );
}

export default StorefrontBranchSwitchFeedback;

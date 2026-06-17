export function SavedCustomerDetailsPanel({
  hasSavedCustomerDetails = false,
  maskedSavedCustomerPreview = '',
  rememberCustomerDetails = false,
  onApply,
  onRememberChange
}) {
  return (
    <div style={{ border: '1px solid #dbe5ee', borderRadius: 12, padding: '10px 12px', background: '#f8fafc', display: 'grid', gap: 10 }}>
      {hasSavedCustomerDetails ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>Use saved details</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{maskedSavedCustomerPreview || 'Saved customer profile'}</div>
          </div>
          <button
            type="button"
            onClick={onApply}
            style={{ minHeight: 34, borderRadius: 10, border: '1px solid #1a4e8d', background: '#fff', color: '#1a4e8d', padding: '0 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
          >
            Apply
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#64748b' }}>No saved details yet. Complete a successful order to reuse your customer details next time.</div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155' }}>
        <input
          type="checkbox"
          checked={rememberCustomerDetails}
          onChange={(event) => onRememberChange?.(event.target.checked)}
          style={{ width: 16, height: 16 }}
        />
        <span>Remember my details for next orders</span>
      </label>
      <div style={{ fontSize: 11, color: '#64748b' }}>Saved details are used only to speed up your checkout.</div>
    </div>
  );
}

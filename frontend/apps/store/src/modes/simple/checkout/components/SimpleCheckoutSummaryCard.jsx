export function SimpleCheckoutSummaryCard({
  amount,
  isSticky = false,
  statusRows = [],
  title = 'Order Summary',
  totalRows = []
}) {
  return (
    <aside style={{ border: '1px solid #d9e4e8', borderRadius: 16, padding: 14, background: '#ffffff', boxShadow: '0 12px 24px rgba(15,23,42,.06)', display: 'grid', gap: 10, position: isSticky ? 'sticky' : 'static', top: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
      <div style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{amount}</div>
      {statusRows.length > 0 ? (
        <div style={{ display: 'grid', gap: 6, fontSize: 13, color: '#334155' }}>
          {statusRows.map((row) => (
            <div key={`${title}-${row.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {totalRows.length > 0 ? (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'grid', gap: 6, fontSize: 13, color: '#334155' }}>
          {totalRows.map((row) => (
            <div key={`${title}-${row.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

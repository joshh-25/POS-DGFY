export function OrderSummaryCard({
  accentColor = '#0f766e',
  totalLabel = 'Order Summary',
  totalAmount,
  money,
  statusRows = [],
  lineItems = [],
  totalsRows = [],
  itemsTitle = 'Your Items',
  bodyFont = "'Avenir Next', 'Segoe UI', sans-serif",
  displayFont = "'Avenir Next', 'Segoe UI', sans-serif",
  sticky = false,
  top = 8,
  promoPanel = null
}) {
  return (
    <aside style={{ border: '1px solid #d9e4e8', borderRadius: 16, padding: 14, background: '#ffffff', boxShadow: '0 12px 24px rgba(15,23,42,.06)', display: 'grid', gap: 10, position: sticky ? 'sticky' : 'static', top }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: bodyFont }}>{totalLabel}</div>
      <div style={{ fontSize: 38, fontWeight: 800, color: '#1e293b', lineHeight: 1, fontFamily: displayFont }}>{money(totalAmount)}</div>
      {statusRows.length > 0 && (
        <div style={{ display: 'grid', gap: 6, fontSize: 13, color: '#334155' }}>
          {statusRows.map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      )}
      {lineItems.length > 0 && (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: displayFont }}>{itemsTitle}</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {lineItems.map((item) => (
              <div key={item.key} style={{ display: 'grid', gridTemplateColumns: item.image ? '48px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
                {item.image ? item.image : null}
                <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: displayFont }}>{item.name}</div>
                  {item.meta ? <div style={{ fontSize: 12, color: '#64748b' }}>{item.meta}</div> : null}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', fontFamily: displayFont }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {promoPanel}
      {totalsRows.length > 0 && (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 10 }}>
          {totalsRows.map((row) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: row.emphasis ? 16 : 13, color: '#334155', paddingTop: row.borderTop ? 8 : 0, borderTop: row.borderTop ? '1px solid #e2e8f0' : 'none' }}>
              <span style={{ fontWeight: row.emphasis ? 700 : 400, fontFamily: row.emphasis ? displayFont : bodyFont }}>{row.label}</span>
              <strong style={{ fontWeight: row.emphasis ? 800 : 700, fontFamily: row.emphasis ? displayFont : bodyFont }}>{row.value}</strong>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

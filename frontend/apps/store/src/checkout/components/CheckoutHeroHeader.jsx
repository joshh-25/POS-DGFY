export function CheckoutHeroHeader({
  eyebrow = 'Order Journey',
  title,
  description,
  badges = [],
  isMobileViewport = false,
  accentColor = '#0f766e',
  accentSoft = '#ecfeff',
  accentBorder = '#99f6e4',
  displayFont = "'Avenir Next', 'Segoe UI', sans-serif"
}) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{eyebrow}</div>
      <div style={{ fontSize: isMobileViewport ? 24 : 28, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, fontFamily: displayFont }}>{title}</div>
      <div style={{ fontSize: 14, color: '#64748b' }}>{description}</div>
      {badges.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {badges.map((badge) => (
            badge.tone === 'pill' ? (
              <span key={badge.label} style={{ fontSize: 12, fontWeight: 700, color: accentColor, background: accentSoft, border: `1px solid ${accentBorder}`, borderRadius: 999, padding: '4px 10px' }}>
                {badge.label}
              </span>
            ) : (
              <span key={badge.label} style={{ fontSize: 12, color: '#64748b' }}>
                {badge.label}
              </span>
            )
          ))}
        </div>
      ) : null}
    </section>
  );
}

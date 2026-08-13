export function CheckoutHeroHeader({
  eyebrow = 'Order Journey',
  title,
  description,
  badges = [],
  isMobileViewport = false,
  accentColor = '#0f766e',
  accentSoft = '#ecfeff',
  accentBorder = '#99f6e4',
  displayFont = "'Avenir Next', 'Segoe UI', sans-serif",
  variant = 'default'
}) {
  const isServicesReference = variant === 'services-reference';
  return (
    <section style={{
      border: isServicesReference ? 'none' : '1px solid #e2e8f0',
      borderRadius: isServicesReference ? 0 : 16,
      background: '#fff',
      padding: isServicesReference ? 0 : (isMobileViewport ? 14 : 18),
      display: 'grid',
      gap: isServicesReference ? 0 : 10,
      alignItems: isServicesReference ? 'start' : undefined,
      justifyItems: isServicesReference ? 'start' : undefined,
    }}>
      <div style={{ fontSize: isServicesReference ? 12.48 : 12, lineHeight: isServicesReference ? 1.6 : undefined, fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: isServicesReference ? 10 : 0 }}>{eyebrow}</div>
      <h1 style={{ margin: 0, fontSize: isServicesReference ? (isMobileViewport ? 30 : 40) : (isMobileViewport ? 24 : 28), fontWeight: 700, color: '#101010', lineHeight: isServicesReference ? 1.25 : 1.1, fontFamily: displayFont, marginBottom: isServicesReference ? 16 : 0 }}>{title}</h1>
      <div style={{ fontSize: isServicesReference ? 16 : 14, lineHeight: isServicesReference ? 1.6 : undefined, color: '#58717a', marginTop: isServicesReference ? 8 : 0 }}>{description}</div>
      {isServicesReference && badges.length > 0 ? (
        <div style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
          {badges.map((badge) => <span key={badge.label}>{badge.label}</span>)}
        </div>
      ) : null}
      {!isServicesReference && badges.length > 0 ? (
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

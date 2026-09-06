export function StorefrontOrderInstructions({
  value = '',
  accentColor = '#0f766e',
  bodyFont = 'inherit',
  compact = false
}) {
  const instructions = String(value || '').trim();
  if (!instructions) return null;

  return (
    <div
      data-testid="order-special-instructions"
      style={{
        borderTop: '1px solid #e2e8f0',
        paddingTop: compact ? 10 : 14,
        display: 'grid',
        gap: 5,
        fontFamily: bodyFont
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Special instructions
      </div>
      <div style={{ fontSize: compact ? 13 : 14, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {instructions}
      </div>
    </div>
  );
}

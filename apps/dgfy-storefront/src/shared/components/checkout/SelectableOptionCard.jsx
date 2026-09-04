import { Check } from 'lucide-react';

export function SelectableOptionCard({
  label,
  active = false,
  onClick,
  icon = null,
  activeBorderColor = '#0f766e',
  activeBackground = '#ecfeff',
  activeTextColor = '#0f766e',
  inactiveBorderColor = '#dbe5ee',
  inactiveBackground = '#fff',
  inactiveTextColor = '#334155',
  activeIconBackground = '#dff3f8',
  inactiveIconBackground = '#f8fafc',
  activeIconColor = null,
  inactiveIconColor = '#1e293b',
  showCheck = true,
  checkColor = null,
  minHeight = 48,
  padding = '12px 14px',
  gap = 12,
  borderRadius = 14,
  activeBoxShadow = '0 8px 20px rgba(15,23,42,0.08)',
  fontSize = 15,
  fontWeight = 700,
  fontFamily = 'inherit',
  iconBoxSize = 40,
  iconSize = 20,
  disabled = false,
  unavailable = false
}) {
  const resolvedActiveIconColor = activeIconColor || activeBorderColor;
  const resolvedCheckColor = checkColor || activeBorderColor;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={unavailable || undefined}
      style={{
        minHeight,
        width: '100%',
        borderRadius,
        border: `1.5px solid ${active ? activeBorderColor : inactiveBorderColor}`,
        background: active ? activeBackground : inactiveBackground,
        padding,
        display: 'flex',
        alignItems: 'center',
        gap,
        cursor: disabled || unavailable ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        boxShadow: active ? activeBoxShadow : 'none',
        boxSizing: 'border-box',
        transition: 'all 200ms ease',
        opacity: disabled || unavailable ? 0.65 : 1,
        filter: unavailable ? 'grayscale(0.35)' : 'none',
        fontFamily
      }}
    >
      {icon ? (
        <div style={{ width: iconBoxSize, height: iconBoxSize, borderRadius: 10, background: active ? activeIconBackground : inactiveIconBackground, display: 'grid', placeItems: 'center', color: active ? resolvedActiveIconColor : inactiveIconColor, flexShrink: 0, transition: 'all 200ms ease' }}>
          {typeof icon === 'function' ? icon({ size: iconSize, active }) : icon}
        </div>
      ) : null}
      <div style={{ flex: '1 1 0%', minWidth: 0, fontSize, fontWeight, color: active ? (activeTextColor || '#1e293b') : inactiveTextColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}{unavailable ? ' (Unavailable)' : ''}
      </div>
      {showCheck ? (
        <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${active ? resolvedCheckColor : inactiveBorderColor}`, background: active ? resolvedCheckColor : '#fff', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, transition: 'all 200ms ease' }}>
          {active ? <Check size={12} strokeWidth={3.2} /> : null}
        </div>
      ) : null}
    </button>
  );
}

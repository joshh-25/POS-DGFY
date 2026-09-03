/**
 * Shared visual contract for the three storefront checkout journeys.
 *
 * Checkout steps are mode-specific for behavior and branding, but their
 * hierarchy and control sizing should remain predictable across industries.
 */
export const CHECKOUT_FONT_FAMILY = "'Segoe UI', Arial, sans-serif";
export const CHECKOUT_CONTROL_MIN_HEIGHT = 44;
export const CHECKOUT_DGFY_BLUE = '#1a4e8d';

export const getCheckoutAddLocationActionStyle = ({
  accentColor = CHECKOUT_DGFY_BLUE,
  accentShadow = 'rgba(26, 78, 141, 0.18)',
  compact = false
} = {}) => ({
  minHeight: compact ? 32 : CHECKOUT_CONTROL_MIN_HEIGHT,
  height: compact ? 32 : undefined,
  borderRadius: compact ? 999 : 12,
  border: `1px solid ${accentColor}`,
  background: accentColor,
  color: '#fff',
  padding: compact ? '0 14px' : '0 14px',
  display: 'flex',
  alignItems: 'center',
  gap: compact ? 6 : 12,
  fontFamily: CHECKOUT_FONT_FAMILY,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
  boxShadow: `0 8px 16px ${accentShadow}`,
  transition: 'background 160ms ease, box-shadow 160ms ease'
});

export const getCheckoutStepTypography = () => ({
  title: {
    fontSize: 18,
    lineHeight: 1.2,
    fontWeight: 700
  },
  description: {
    fontSize: 13,
    lineHeight: 1.45,
    fontWeight: 400
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 1.3,
    fontWeight: 700
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 600
  },
  control: {
    minHeight: CHECKOUT_CONTROL_MIN_HEIGHT,
    fontSize: 13,
    lineHeight: 1.35,
    fontWeight: 500
  },
  action: {
    minHeight: CHECKOUT_CONTROL_MIN_HEIGHT,
    fontSize: 13,
    lineHeight: 1.35,
    fontWeight: 700
  }
});

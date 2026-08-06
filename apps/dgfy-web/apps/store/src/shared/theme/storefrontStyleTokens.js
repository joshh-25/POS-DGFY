export const STYLES = {
  colors: {
    brand: '#ea580c',
    brandDark: '#c2410c',
    brandLight: '#fff7ed',
    teal: '#0f766e',
    tealLight: '#ecfeff',
    amber: '#f59e0b',
    dark: '#0f172a',
    text: '#334155',
    muted: '#64748b',
    border: '#e2e8f0',
    bg: '#f8fafc'
  },
  radius: { card: '24px', input: '14px', button: '12px' },
  shadow: {
    sm: '0 4px 12px rgba(15,23,42,0.04)',
    md: '0 12px 34px rgba(15,23,42,0.08)',
    lg: '0 24px 58px rgba(15,23,42,0.12)'
  },
  fonts: {
    body: '"Open Sans", "Segoe UI", system-ui, sans-serif',
    heading: '"Inter", "Open Sans", "Segoe UI", system-ui, sans-serif',
    main: '"Open Sans", "Segoe UI", system-ui, sans-serif'
  }
};

export const HERO_CANVAS_MAX_WIDTH = 1320;
export const STOREFRONT_INFO_PANEL_MAX_WIDTH = HERO_CANVAS_MAX_WIDTH - 84;
export const STOREFRONT_CONTACT_INFO_COLUMNS = 'minmax(0, 0.96fr) minmax(248px, 1.04fr)';
export const STOREFRONT_INFO_ROW_GAP = 12;
export const STOREFRONT_INFO_ICON_COLUMN = 20;
export const MAX_STOREFRONT_CONTACT_ROWS = 4;
export const MAX_STOREFRONT_WHY_CHOOSE_US = 4;

export const MOBILE_NATIVE_SELECT_STYLE = {
  width: '100%',
  minHeight: 44,
  borderRadius: 14,
  border: '1px solid #dbe5ee',
  background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
  padding: '0 42px 0 14px',
  fontSize: 14,
  fontWeight: 700,
  color: STYLES.colors.dark,
  fontFamily: 'inherit',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  boxShadow: '0 8px 18px rgba(15,23,42,.06)',
  cursor: 'pointer'
};

export const MOBILE_DROPDOWN_MENU_STYLE = {
  left: 0,
  right: 0,
  width: '100%',
  minWidth: '100%',
  marginTop: 8,
  borderRadius: 18,
  padding: 8,
  border: '1px solid #dbe5ee',
  background: '#ffffff',
  boxShadow: '0 18px 36px rgba(15,23,42,.16)'
};

export const MOBILE_DROPDOWN_OPTION_STYLE = {
  minHeight: 48,
  padding: '12px 14px'
};

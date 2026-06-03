/**
 * DGFY Brand Standards & Design System
 * Version 1.0
 *
 * Official source of truth for DGFY branding and frontend implementation.
 */

export const dgfyTheme = {
  colors: {
    // Primary Colors
    primary: '#1A4E8D',      // Ocean Blue - Buttons, navigation, active states
    secondary: '#A9DCE8',    // Ice Blue - Background highlights, hover states

    // Neutral Palette
    gray900: '#0F172A',
    gray800: '#1E293B',
    gray700: '#334155',
    gray600: '#475569',
    gray500: '#64748B',
    gray300: '#CBD5E1',
    gray100: '#F1F5F9',
    white: '#FFFFFF',

    // Semantic Colors
    success: '#16A34A',      // Success notifications, confirmed actions
    warning: '#F59E0B',      // Alerts, pending status
    error: '#DC2626',        // Failed actions, critical warnings
    information: '#2563EB',  // System messages

    // Additional accents referenced
    primaryDark: '#1A4586',  // Darker Ocean Blue
    secondaryLight: '#AEE8F4' // Lighter Ice Blue
  },

  typography: {
    fontFamily: "'Poppins', sans-serif",
    weights: {
      regular: 400,
      medium: 500,
      semiBold: 600,
      bold: 700
    },
    scale: {
      display: { fontSize: '56px', fontWeight: 700 }, // Hero sections
      h1: { fontSize: '48px', fontWeight: 700 },
      h2: { fontSize: '36px', fontWeight: 600 },
      h3: { fontSize: '30px', fontWeight: 600 },
      h4: { fontSize: '24px', fontWeight: 600 },
      bodyLarge: { fontSize: '18px', fontWeight: 400 },
      body: { fontSize: '16px', fontWeight: 400 },
      small: { fontSize: '14px', fontWeight: 400 },
      caption: { fontSize: '12px', fontWeight: 400 }
    }
  },

  layout: {
    desktop: { columns: 12, maxWidth: '1440px', contentWidth: '1280px' },
    tablet: { columns: 8 },
    mobile: { columns: 4, targetWidth: '390px' }
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    '2xl': '32px',
    '3xl': '48px',
    '4xl': '64px',
    '5xl': '96px',
    '6xl': '128px'
  },

  borderRadius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    pill: '9999px' // Tags, badges, chips, status indicators
  },

  shadows: {
    card: '0px 4px 20px rgba(0,0,0,0.08)',
    modal: '0px 12px 40px rgba(0,0,0,0.12)'
  },

  buttons: {
    height: '48px',
    radius: '12px',
    primary: {
      background: '#1A4E8D',
      text: '#FFFFFF'
    },
    secondary: {
      background: 'transparent',
      border: '1px solid #1A4E8D',
      text: '#1A4E8D'
    },
    danger: {
      background: '#DC2626',
      text: '#FFFFFF'
    }
  },

  cards: {
    background: '#FFFFFF',
    radius: '12px',
    padding: '16px 24px', // Standardized 16px to 24px
  }
};

export default dgfyTheme;

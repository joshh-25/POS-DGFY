---
status: authoritative
authority_level: authoritative
owner: product-design
last_reviewed: 2026-05-22
applies_to: dgfy_ui_branding_and_frontend
topic: dgfy_branding
---

# DGFY Brand Standards & Design System

Version 1.0

## Document Purpose

This document is the DGFY-only branding and design-system source of truth for:

- DGFY storefronts
- DGFY marketplace experiences
- DGFY POS user-facing surfaces
- DGFY marketing materials
- future DGFY product extensions

All designers, frontend developers, backend developers, QA testers, content creators, and product managers must follow this document when building or reviewing DGFY-branded experiences.

This file is intentionally separate from other system branding so DGFY guidance can evolve without overwriting SKUpervisor, tenant, operator, or legal/fiscal branding rules.

Branding separation must remain consistent with [ADR 0012](../architecture/adr/0012-dgfy-global-convenience-fee-and-ui-brand-separation.md).

## 1. Brand Overview

### Brand Name

DGFY

### Full Meaning

Discover Goods For You

### Brand Mission

To help people discover products, services, stores, and opportunities around them through a location-based digital marketplace platform.

### Brand Vision

To become the leading local discovery platform that connects consumers with businesses through intelligent search, mapping, and digital commerce.

### Brand Personality

DGFY should always feel:

- Modern
- Reliable
- Helpful
- Fast
- Discoverable
- Innovative
- Accessible
- Professional

Avoid:

- Overly playful visuals
- Excessive animations
- Cluttered interfaces
- Outdated UI patterns
- Difficult navigation

## 2. Brand Positioning

### Core Message

Find products and services around you instantly.

### Value Proposition

DGFY helps users discover nearby products, services, and businesses through intelligent location-based search and digital marketplace technology.

### Brand Keywords

- Discovery
- Marketplace
- Local Search
- Nearby Services
- Product Search
- Business Visibility
- Commerce
- Convenience

## 3. Logo Standards

### Primary Logo

Wordmark logo with integrated location pin symbol.

Usage:

- Website headers
- Mobile applications
- Marketing materials
- Presentations
- Official documents

Minimum size:

- Desktop: `120px` width
- Mobile: `90px` width

### Horizontal Logo

Usage:

- Navigation bars
- Website footers
- Partner branding
- Co-branding assets

### Logo Mark

Location pin and search icon only.

Usage:

- App icon
- Favicon
- Social media profile image
- Loading screens
- Small spaces

### Clear Space

Maintain a minimum clear space equivalent to one logo-mark width around the logo. No text, graphics, or UI elements may enter this space.

### Incorrect Usage

Do not:

- Stretch the logo
- Compress the logo
- Rotate the logo
- Change the logo colors
- Apply gradients
- Add shadows
- Distort proportions
- Place it on low-contrast backgrounds

## 4. Color System

### Primary Color

#### Ocean Blue

- HEX: `#1A4E8D`
- RGB: `26, 78, 141`

Usage:

- Primary buttons
- Navigation
- Active states
- Branding elements
- Key actions

### Secondary Colors

#### Deep Blue

- HEX: `#1A4586`
- RGB: `26, 69, 134`

Usage:

- Secondary navigation emphasis
- Selected states
- Surface accents
- Supporting brand elements

#### Ice Blue

- HEX: `#AEE8F4`
- RGB: `174, 232, 244`

Usage:

- Background highlights
- Hover states
- Secondary accents
- Informational areas

Note:

- `#AEE8F4` is the approved light secondary blue for DGFY.
- If older materials reference `#A9DCE8`, treat that as superseded for new DGFY work.

### Neutral Palette

- Gray 900: `#0F172A`
- Gray 800: `#1E293B`
- Gray 700: `#334155`
- Gray 600: `#475569`
- Gray 500: `#64748B`
- Gray 300: `#CBD5E1`
- Gray 100: `#F1F5F9`
- White: `#FFFFFF`

## 5. Semantic Colors

- Success: `#16A34A`
- Warning: `#F59E0B`
- Error: `#DC2626`
- Information: `#2563EB`

Usage:

- Success for confirmed actions and available status
- Warning for alerts and pending states
- Error for failed actions and validation errors
- Information for system and informational notices

## 6. Typography Standards

### Primary Typeface

Poppins

Supported weights:

- Regular `400`
- Medium `500`
- SemiBold `600`
- Bold `700`

### Type Scale

- Display: `56px`, Bold
- H1: `48px`, Bold
- H2: `36px`, SemiBold
- H3: `30px`, SemiBold
- H4: `24px`, SemiBold
- Body Large: `18px`, Regular
- Body: `16px`, Regular
- Small: `14px`, Regular
- Caption: `12px`, Regular

## 7. Layout System

### Grid System

- Desktop: `12` columns, maximum width `1440px`, content width `1280px`
- Tablet: `8` columns
- Mobile: `4` columns

### Spacing Scale

Use only these spacing values:

- `4px`
- `8px`
- `12px`
- `16px`
- `24px`
- `32px`
- `48px`
- `64px`
- `96px`
- `128px`

Avoid arbitrary spacing values in new DGFY work.

## 8. Border Radius Standards

- Small: `8px`
- Medium: `12px`
- Large: `16px`
- Extra Large: `24px`
- Pill: `9999px`

Pill usage:

- Tags
- Badges
- Chips
- Status indicators

## 9. Shadow System

### Card Shadow

```css
box-shadow: 0px 4px 20px rgba(0, 0, 0, 0.08);
```

### Modal Shadow

```css
box-shadow: 0px 12px 40px rgba(0, 0, 0, 0.12);
```

Avoid excessive shadows across the platform.

## 10. Button Standards

### Primary Button

- Background: `#1A4E8D`
- Text: `#FFFFFF`
- Height: `48px`
- Radius: `12px`

### Secondary Button

- Background: `transparent`
- Border: `1px solid #1A4E8D`
- Text: `#1A4E8D`

### Danger Button

- Background: `#DC2626`
- Text: `#FFFFFF`

## 11. Card Standards

All cards must use:

- White background
- `12px` radius
- Consistent elevation
- `16px` to `24px` padding
- Clear visual hierarchy

Supported card types:

- Product Card
- Service Card
- Store Card
- Booking Card
- Order Card
- Notification Card

## 12. Icon Standards

Preferred libraries:

- Ionicons
- Material Symbols

Supported sizes:

- `16px`
- `20px`
- `24px`
- `32px`

Do not mix icon families within the same interface.

## 13. Mobile Design Standards

- Target mobile width: `390px`
- Safe area support required

### Bottom Navigation

- Maximum: `5` items
- Recommended:
  - Home
  - Explore
  - Orders
  - Messages
  - Profile

## 14. Accessibility Standards

- Minimum contrast ratio: `4.5:1`
- Minimum touch target: `44px x 44px`

Required:

- Keyboard navigation support
- Proper ARIA labels
- Screen reader compatibility
- Accessible color combinations

## 15. UI Design Principles

### Discoverability

Users must immediately understand available actions.

### Simplicity

Reduce unnecessary clicks and complexity.

### Consistency

Maintain predictable behavior throughout the platform.

### Speed

Interfaces should feel fast and responsive.

### Mobile First

Design mobile experiences before desktop.

### Location First

Maps and nearby discovery should remain central to the DGFY experience.

## 16. Frontend Technical Standards

### Framework

- ReactJS
- Vite

### Styling

Preferred:

- Tailwind CSS

### State Management

Preferred:

- Zustand
- React Context

### Maps

- MapLibre

### Icons

- Ionicons

### Responsive Breakpoints

- Mobile: `0px-767px`
- Tablet: `768px-1023px`
- Desktop: `1024px-1439px`
- Large Desktop: `1440px+`

## 17. Product Naming Standards

Approved product names:

- DGFY
- DGFY Marketplace
- DGFY POS
- DGFY Inventory Engine
- Powered by SKUpervisor

Avoid:

- DGFY App
- DGFY System
- Discover Marketplace

## 18. Tone of Voice

Writing should be:

- Clear
- Direct
- Helpful
- Friendly
- Professional

Examples:

- Find nearby services
- Search products around you
- View store details
- Explore local businesses

Avoid:

- Technical jargon
- Marketing hype
- Long paragraphs
- Complex instructions

## 19. Governance

This document is the official source of truth for DGFY branding and frontend implementation.

All new DGFY products, features, interfaces, and marketing materials must comply with these standards before release.

Any update to the DGFY design system must be documented and approved before implementation.

## 20. Separation Rule

This document applies to DGFY branding only.

It must not be used to overwrite:

- SKUpervisor legal branding
- tenant business branding
- fiscal issuer identity
- compliance-mandated legal labels

When a DGFY surface also displays regulated business identity, DGFY brand presentation must coexist with legal/fiscal requirements rather than replacing them.

---

End of document.

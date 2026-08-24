# DGFY.ph — Store Page Design System
> Design analysis & specification for consistency, clarity, and tap-first interaction

---

## 1. Design Philosophy

The DGFY.ph store page operates like a **well-organized sari-sari store front** — everything the customer needs to decide *right now* is visible without having to ask. The hierarchy is: *trust signals first, then browse, then act.* This document standardizes that intent into a repeatable system.

Three core principles govern all design decisions:

| Principle | What It Means |
|---|---|
| **Consistency** | Same visual language everywhere. Buttons look like buttons. Cards look like cards. No surprises. |
| **Straightforwardness** | One screen = one primary action. No hidden menus, no guessing. |
| **Tap-only** | Every interaction must complete with a single, fat-finger-safe tap. No swipe-to-reveal, no long-press, no pinch. |

---

## 2. Design Tokens

Think of design tokens as the **single source of truth** — like a recipe's ingredient list. If you change the ingredient here, every dish using it updates automatically.

### 2.1 Color

```css
/* Core Brand */
--color-primary:        #F05A1A;   /* CTA orange — Order Now, Add, active chips */
--color-primary-dark:   #C94714;   /* Pressed / hover state of primary */
--color-primary-light:  #FFF0EA;   /* Tinted backgrounds, badge fills */

/* Semantic */
--color-success:        #1CB85B;   /* "Open" badge */
--color-warning:        #F5A623;   /* Star rating fill */
--color-destructive:    #E53935;   /* Error states, promo highlights */

/* Neutral Scale */
--color-neutral-900:    #1A1A1A;   /* Primary headings */
--color-neutral-700:    #3D3D3D;   /* Body text */
--color-neutral-500:    #7A7A7A;   /* Subtitles, meta info */
--color-neutral-300:    #C4C4C4;   /* Dividers, empty rating bars */
--color-neutral-100:    #F5F5F5;   /* Card backgrounds, chips */
--color-neutral-0:      #FFFFFF;   /* Base surface */

/* Overlay (for hero banners) */
--color-overlay-dark:   rgba(0, 0, 0, 0.55);
```

**Rule:** `--color-primary` is used for exactly three things: primary CTAs, active/selected states, and price labels. Nothing else. Overusing orange dilutes the call-to-action signal — like a fire alarm going off in every room.

---

### 2.2 Typography

```css
/* Scale (use rem, base 16px) */
--text-xs:    0.75rem;   /* 12px — labels, legal, badges */
--text-sm:    0.875rem;  /* 14px — secondary body, meta */
--text-base:  1rem;      /* 16px — primary body, descriptions */
--text-lg:    1.125rem;  /* 18px — card titles, section labels */
--text-xl:    1.375rem;  /* 22px — subsection headings */
--text-2xl:   1.75rem;   /* 28px — page section titles */
--text-3xl:   2.25rem;   /* 36px — hero store name */

/* Weight */
--font-regular:  400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* Line Height */
--leading-tight:  1.2;   /* Headings */
--leading-normal: 1.5;   /* Body */
--leading-loose:  1.75;  /* Small text, labels */
```

**Type Hierarchy Pattern:**

```
Store Name (3xl / bold / neutral-900)
  └── Tagline (base / regular / primary — italic)
      └── Section Title (xl / semibold / neutral-900)
          └── Card Title (lg / semibold / neutral-900)
              └── Description (sm / regular / neutral-500)
                  └── Price (base / bold / primary)
```

---

### 2.3 Spacing

Based on an **8px grid** — like graph paper where every element snaps to a square. Mixing arbitrary values (13px, 17px) is what makes layouts feel "off" even when you can't name why.

```css
--space-1:   4px;
--space-2:   8px;
--space-3:   12px;
--space-4:   16px;
--space-5:   20px;
--space-6:   24px;
--space-8:   32px;
--space-10:  40px;
--space-12:  48px;
--space-16:  64px;
```

---

### 2.4 Border Radius

```css
--radius-sm:   4px;    /* Badges, tags */
--radius-md:   8px;    /* Cards, inputs */
--radius-lg:   12px;   /* Panels, image containers */
--radius-xl:   16px;   /* Modal sheets, bottom drawers */
--radius-pill: 999px;  /* Filter chips, CTA buttons */
```

---

### 2.5 Elevation (Shadows)

```css
--shadow-card:    0 1px 4px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.04);
--shadow-panel:   0 4px 16px rgba(0,0,0,0.10);
--shadow-modal:   0 8px 32px rgba(0,0,0,0.18);
--shadow-fab:     0 4px 12px rgba(240,90,26,0.35);  /* Orange for primary FAB */
```

---

## 3. Component Specifications

### 3.1 Buttons

The golden rule: **every button must have a minimum tap target of 44×44px** — per Apple HIG and Google Material. A button that's 24px tall on mobile is a button nobody can tap reliably, like trying to hit a jeepney stop button with your elbow.

#### Primary CTA
```
Background:   --color-primary
Text:         --color-neutral-0
Font:         --text-base / --font-semibold
Radius:       --radius-pill
Padding:      12px 24px
Min-height:   48px
Icon:         Optional leading icon, 20px
Pressed:      Background → --color-primary-dark, scale(0.97)
```

#### Secondary (Outlined)
```
Background:   transparent
Border:       1.5px solid --color-neutral-0  (on dark bg)
              1.5px solid --color-primary     (on light bg)
Text:         matches border color
Everything else: same as primary
```

#### Icon Button (Message, Call)
```
Size:         48×48px minimum
Background:   transparent or --color-neutral-0 at 15% opacity
Icon:         24px
Radius:       --radius-pill
```

**Consistency rule:** There are currently three button styles in the hero (Message, Call, Order Now). Message and Call should be visually grouped as "secondary actions" and Order Now isolated as the sole primary. The visual weight difference must be obvious at a glance.

---

### 3.2 Filter Chips

```
Height:       40px (tap-safe)
Padding:      0 16px
Radius:       --radius-pill
Gap between:  8px

Inactive:
  Background: --color-neutral-100
  Text:       --color-neutral-700 / --text-sm / --font-medium

Active:
  Background: --color-primary
  Text:       --color-neutral-0 / --text-sm / --font-semibold
```

**⚠️ Tap-only concern:** The current filter chip row uses horizontal scroll. On mobile, this becomes a **swipe gesture** to discover more options — violating the tap-only principle.

**Fix:** Show a max of 4 chips + a "More ▼" chip that opens a bottom sheet with all categories. All tappable, nothing swipeable.

---

### 3.3 Menu Item Card

```
Layout:       Vertical (image top, content bottom)
Image:        Full-width, 4:3 ratio, object-fit: cover, --radius-lg top corners
Content:      Padding --space-3

Title:        --text-lg / --font-semibold / --neutral-900
Description:  --text-sm / --font-regular / --neutral-500 / 2 lines max (line-clamp)
Price:        --text-base / --font-bold / --color-primary
Add button:   Sits bottom-right, pill, 36px height, "+ Add" label

Card shadow:  --shadow-card
Tap state:    Whole card tappable → opens item detail sheet
              Add button has independent tap zone
```

**Consistency issue noted:** The "+ Add" button in the current design is inconsistently sized across cards. Standardize to exactly `36px height × 80px width` as a fixed pill.

---

### 3.4 Review Item

```
Avatar:       32px circle, initials fallback
Name:         --text-sm / --font-semibold / --neutral-900
Time:         --text-xs / --font-regular / --neutral-500
Stars:        16px icons, --color-warning fill
Body:         --text-sm / --font-regular / --neutral-700
Max lines:    3 (expandable via "Read more" tap)
```

---

### 3.5 Rating Bar (Histogram)

```
Label (5★):   --text-xs / --neutral-500 / right-aligned
Bar track:    4px height, --color-neutral-300, --radius-pill, flex-grow
Bar fill:     --color-warning, animated width on load
Percentage:   --text-xs / --neutral-500 / right-aligned / min-width 30px
```

---

### 3.6 Status Badge

```
"Open":
  Background: rgba(28, 184, 91, 0.12)
  Text:       --color-success / --text-sm / --font-semibold
  Radius:     --radius-sm
  Padding:    4px 8px

"Best Seller":
  Background: --color-primary
  Text:       --color-neutral-0
  Position:   Absolute top-left on card image
  Radius:     0 0 --radius-sm 0  (only bottom-right rounded)
```

---

## 4. Tap-Only Interaction Model

Think of this like a TV remote — every function has a dedicated button you can hit without looking. Nothing requires two hands, a gesture, or a sequence.

### 4.1 Principles

1. **One tap = one result.** No ambiguity. Tapping a card opens it. Tapping Add adds it.
2. **No gesture dependencies.** Swipe, pinch, long-press, pull-to-refresh — none of these are relied upon for core flows.
3. **No hidden affordances.** If an action exists, it has a visible button. Nothing lives behind a swipe reveal.
4. **Destructive actions always have a confirm step.** Remove item → confirm bottom sheet.

### 4.2 Navigation Pattern

Use a **persistent bottom navigation bar** on mobile (≤768px) for the five main sections:

```
[ 🏠 Home ]  [ 🔍 Search ]  [ 📦 Orders ]  [ 💬 Messages ]  [ 👤 Profile ]
```

Height: 60px + safe-area-inset-bottom. Each tab: 48px tap zone.

The floating cart bar (`2 items in cart · ₱60.00 → View Cart`) already follows this pattern — it's pinned to bottom, always visible, single tap to open. ✅ Keep this pattern everywhere.

### 4.3 Problematic Patterns to Replace

| Current Pattern | Problem | Tap-Only Fix |
|---|---|---|
| Horizontal scroll for filter chips | Swipe gesture required to discover hidden chips | Show 4 chips + "More" tap → bottom sheet |
| Map embed (Google Maps) | Pinch-to-zoom, scroll conflict | Static map image + "Get Directions" button that opens Maps app |
| "View all photos" small link | Tap target too small (~24px) | Dedicated full-width photo gallery row with visible chevron |
| Review overflow (truncated) | May imply swipe or scroll context | Add explicit "Read more" inline text button |
| Image carousel (if present) | Swipe to advance | Dot indicators + visible left/right arrow buttons on desktop, full-tap zones on mobile |

### 4.4 Bottom Sheet Pattern (Primary Modal)

All detail views (menu item detail, photo gallery, all reviews, category filter) open as **bottom sheets** — never full-page navigations that lose scroll context.

```
Trigger:        Single tap
Entry:          Slide up from bottom (300ms ease-out)
Dismiss:        Tap outside dim overlay OR tap × button (no swipe-down)
Handle:         Visible drag handle (decorative only — not a gesture requirement)
Max height:     85vh
Scroll within:  Standard vertical scroll inside sheet (acceptable, universal)
```

---

## 5. Layout & Grid

### 5.1 Page Grid

```
Mobile  (< 768px):   1 column, 16px horizontal padding
Tablet  (768–1024px): 2 columns, 24px padding
Desktop (> 1024px):  12-column, 32px padding, 24px gutter

Content max-width: 1280px, centered
```

### 5.2 Menu Card Grid

```
Mobile:   2 columns, 8px gap
Tablet:   3 columns, 12px gap
Desktop:  4–5 columns, 16px gap
```

### 5.3 Hero Layout

```
Height:       260px (mobile) / 360px (desktop)
Background:   Cover image + --color-overlay-dark
Logo card:    Absolute, bottom-left offset, white bg, --radius-lg, --shadow-panel
CTA row:      Absolute or below-hero, flex-row, right-aligned
```

---

## 6. Consistency Audit of Current Design

### ✅ What's Consistent and Working

- Orange primary color used correctly for CTAs and active states
- Card component structure (image → title → desc → price → action) is uniform across menu items
- Typography weight hierarchy is clear (heavy headings, light descriptions)
- Rating system (stars + histogram) is cohesive
- "Open" badge placement and color are unambiguous

### ⚠️ Inconsistencies to Fix

| Issue | Location | Fix |
|---|---|---|
| Button height variance | Hero CTAs vs. card Add buttons | Standardize to 3 sizes: sm (32px), md (44px), lg (52px) |
| Icon inconsistency | Message icon (chat bubble) vs. Call icon (phone) — different visual weight | Use a single icon library (e.g., Lucide or Phosphor), same stroke width |
| Section heading style | "MENU", "OVERVIEW", "WHY CHOOSE US?" — all-caps vs. title case inconsistency | Pick one: Title Case throughout |
| Card border vs. shadow | Some cards use shadow, promo section uses solid border + orange fill | Unify: white cards always use --shadow-card, colored panels use no border |
| Delivery partner logos | Grab/FoodPanda/Lalamove logos are different sizes and visual weights | Constrain all to 24px height, grayscale, consistent horizontal spacing |

---

## 7. Accessibility Baselines

- **Color contrast:** All text on colored backgrounds must meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
- **Focus states:** Visible ring on all interactive elements for keyboard/switch access
- **Touch targets:** 44×44px minimum, 8px spacing between adjacent targets
- **Loading states:** Skeleton screens (not spinners) for card grids — avoids layout shift
- **Empty states:** Every empty list or failed search must show an icon + message + primary action button

---

## 8. Motion & Feedback

| Interaction | Animation |
|---|---|
| Button press | scale(0.97), 80ms ease-in-out |
| Card tap | Subtle background darken, 100ms |
| Add to cart | Item count badge bounce (spring), cart bar slides up if hidden |
| Bottom sheet open | translateY(100%) → 0, 280ms cubic-bezier(0.4, 0, 0.2, 1) |
| Filter chip switch | Background color transition, 150ms |
| Rating bar load | Width animates from 0, staggered per row, 400ms ease-out |

**Rule:** No animation should exceed 350ms for navigation or 500ms for entrance effects. Animations are feedback, not entertainment — like a door handle that clicks when it latches.

---

## 9. Component State Matrix

Every interactive element must have all five states defined:

| State | Definition |
|---|---|
| **Default** | Resting, no interaction |
| **Hover** | Cursor over (desktop only, ignored on mobile) |
| **Pressed/Active** | Finger/click down |
| **Disabled** | Action unavailable — reduced opacity (40%), no pointer events |
| **Loading** | Async action in flight — spinner replaces label, button stays same size |

---

## 10. Quick Reference — Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Use `--color-primary` only for primary actions | Use orange for decorative elements or section dividers |
| Give every tap target ≥ 44px height | Use links styled as plain underlined text for navigation |
| Open details in bottom sheets | Full-page navigate away from store context |
| Show static map + "Directions" button | Embed interactive map that steals scroll |
| Use horizontal chip row with "More" overflow tap | Rely on horizontal scroll to reveal all categories |
| Show skeleton loaders during fetch | Show full-page spinner that blocks content |
| Use system font stack for body text | Load 4+ custom font weights unnecessarily |
| Confirm before removing cart item | Silent destructive actions |

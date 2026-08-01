# Plan — Image Lifecycle, Metadata & POS Optimization (Phases 1–7)

## High-Level Strategy
Implement an authoritative image lifecycle and metadata management framework for POS-DGFY across 7 phases:
1. **Phase 1: Lifecycle Contract And Tests (P0)**: Define state resolution rules (`legacy`, `optimized`, `unchanged`, `replaced`, `missing`, `external`) and semantic variants (`thumbnail`, `catalog_card`, `checkout`, `preview`). Add contract test suite for Save Item gaps.
2. **Phase 2: Image Metadata (P0)**: Add repeatable migrations for `storefront_catalog_overrides` table adding `image_fingerprint`, `optimization_version`, `processing_status`, `variant_metadata`. Register in schema syncer and Sequelize model.
3. **Phase 3: Backend Image Lifecycle (P0)**: Implement authoritative `ensureOptimizedItemImage` operation. Convert legacy images once, compute SHA-256 fingerprints, reuse unchanged assets without recompression, and handle failure rollbacks safely.
4. **Phase 4: Save Item Integration (P0)**: Invoke image lifecycle processing on Save Item/update item. Remove early-return guards bypassing legacy image repair. Return updated item with optimized URLs.
5. **Phase 5: POS Consumers (P1)**: Update POS Catalog, Checkout, and Item Preview surfaces to consume specific semantic image variants (`catalog_card`, `checkout`, `preview`) with safe fallback hierarchy.
6. **Phase 6: Replacement And Cleanup (P0)**: Generate and validate new versioned replacement assets before updating DB references. Clean up old files post-commit only after verifying zero shared references.
7. **Phase 7: Full Validation (P0 release gate)**: Execute full test suite (migrations, backend lifecycle, frontend build, contract tests, image 200 HTTP responses, cache header rules).

## Goals
- [x] 1. **Phase 1**: Define lifecycle contracts, semantic variants, and add Save Item gap tests.
- [x] 2. **Phase 2**: Create additive DB migration, update `sync-tenant-schemas.js` and `StorefrontCatalogOverride` model.
- [x] 3. **Phase 3**: Implement `ensureOptimizedItemImage` operation with SHA-256 fingerprinting and Sharp multi-format responsive output.
- [x] 4. **Phase 4**: Wire `ensureOptimizedItemImage` into `updateItem` / `upsertStorefrontCatalogOverride` and remove legacy early-return bypass.
- [x] 5. **Phase 5**: Update POS UI components (`POSCheckoutTerminal`, `SkupervisorPOSCheckoutTerminal`, `CartItemThumbnail`, `ItemPreviewModal`) to request semantic variants.
- [x] 6. **Phase 6**: Implement safe post-commit file garbage collection with shared-reference checks and async error handling.
- [x] 7. **Phase 7**: Run full validation suite (migrations, backend tests, frontend build/tests, 200 asset status).

---

# Plan — POS Catalog & Current Sale Layout Redesign (Matching Picture 2)

## High-Level Strategy
Redesign the POS Catalog workspace layout and styling in `POSCheckoutTerminal.jsx`, `SkupervisorPOSCheckoutTerminal.jsx`, and `TerminalPageLayout.jsx` to closely match the clean, compact POS layout of Picture 2.

Key design updates:
1. **Compact Top Header Bar**: Streamline top header with title ("POS Catalog"), subtitle ("Browse and add items to current sale"), notification bell with badge, and terminal status badge ("Terminal: JOHN-01 • Online").
2. **Search, Scan, Filter & Category Pills**: Compact search bar with search icon, dedicated `Scan Barcode` button with scan icon, `Filter` dropdown button with filter icon, plus a horizontal scrollable category tab pill bar (`All Items`, `Beverages`, `Food`, `Snacks`, `Desserts`, `Combo`).
3. **High-Density Product Card Grid**: Responsive grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3`) with rounded cards (`rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-all`), image container (`h-28 sm:h-32`), top-left `ALWAYS AVAILABLE` status badge, item code pill overlay, product title, price, and blue circular `+` add button.
4. **Compact Current Sale Panel**: Right-side panel (`w-80 lg:w-96`) featuring order method & payment selectors, independently scrollable item list with small thumbnails, quantity steppers, red trash icon remove button, dashed `+ Add Note` trigger, clear totals breakdown (Subtotal, Tax, Total), and prominent `Checkout` primary action button.
5. **Responsive & Independent Scrolling**: Let catalog grid and Current Sale cart panel scroll independently without full page jumps, optimizing for mobile, tablet, and desktop viewports.

Strictly UI-only change: Preserve all backend logic, APIs, cart math, prices, taxes, permissions, field bindings, labels, and existing functionality.

## Goals
- [x] 1. **Header & Navigation Polish**: Update top header bar in `TerminalPageLayout.jsx` to match Picture 2 with compact title, notification badge, and terminal status indicator.
- [x] 2. **Controls & Category Pills**: Implement compact Search, Scan, Filter control row and horizontal Category Tab pill bar in `POSCheckoutTerminal.jsx` and `SkupervisorPOSCheckoutTerminal.jsx`.
- [x] 3. **Product Card Grid Redesign**: Upgrade product cards in `POSCheckoutTerminal.jsx` and `SkupervisorPOSCheckoutTerminal.jsx` with image container, stock overlay badge, item code badge, price, and circular blue `+` button in a responsive multi-column grid.
- [x] 4. **Current Sale Panel Redesign**: Streamline the right panel with compact selectors, item cards with thumbnails & trash icons, totals breakdown, and prominent `Checkout` button.
- [x] 5. **Contract Test & Build Verification**: Run ESLint and Vitest contract tests to verify zero regressions.

---

# Plan — Current Sale Item Thumbnail Indicator

## High-Level Strategy
Add a small, performance-optimized item thumbnail (36x36px) directly beside each product title in the "Current Sale" cart list across `POSCheckoutTerminal.jsx` and `SkupervisorPOSCheckoutTerminal.jsx`. The thumbnail uses downscaled thumbnail assets, fixed container dimensions, `object-fit: cover`, `loading="lazy"`, `decoding="async"`, and a lightweight fallback icon (`Utensils`) to guarantee zero performance lag during busy sales.

All cart calculations, quantity controls, price inputs, remove buttons, backend APIs, and checkout flows will remain 100% unchanged.

## Goals
- [x] 1. **Cart Item Thumbnail Component**: Implement `CartItemThumbnail` using downscaled asset URLs with `object-cover`, `loading="lazy"`, `decoding="async"`, and an icon fallback (`Utensils` in a `bg-slate-100` container).
- [x] 2. **Current Sale List Integration**: Render the thumbnail beside `line.item_name` in each cart item card in `POSCheckoutTerminal.jsx` and `SkupervisorPOSCheckoutTerminal.jsx`.
- [x] 3. **Contract Test & Build Verification**: Ensure ESLint, Vitest contract tests, and frontend build compile cleanly without regression.

---

# Plan — POS Catalog Item Add-to-Cart Toast Notification Overlay

## High-Level Strategy
Implement a modern, non-blocking top-right toast notification overlay in POS Checkout Terminal (`POSCheckoutTerminal.jsx` and `SkupervisorPOSCheckoutTerminal.jsx`) that triggers whenever a product is added from the POS Catalog to Current Sale. The toast displays the product thumbnail, item name, quantity pill, and the message "Added to current sale." Toasts stack neatly at the top-right, animate with smooth slide/fade effects, auto-dismiss after 2.5 seconds, and deduplicate consecutive additions of the same product to prevent overlapping notifications.

All existing cart logic, pricing, quantity controls, stock checks, barcode scans, backend APIs, and checkout flows will be 100% preserved.

## Goals
- [x] 1. **Toast Overlay Component (`PosAddToCartToastContainer.jsx`)**: Build a dedicated fixed overlay component (`pointer-events-none z-[9999]`) rendering top-right stacked toasts with product thumbnail, item name, quantity badge, "Added to current sale." message, and smooth enter/exit animation.
- [x] 2. **Deduplication & Auto-Dismiss State**: Maintain `addToCartToasts` state with a 2.5-second auto-dismiss lifecycle and deduplication logic (updating quantity and resetting timer when the same item is re-tapped).
- [x] 3. **Catalog Integration**: Hook `triggerAddToCartToast` inside `addToCart` and stepper additions in `POSCheckoutTerminal.jsx` and `SkupervisorPOSCheckoutTerminal.jsx`.
- [x] 4. **Contract Test & Build Verification**: Ensure ESLint, Vitest contract tests, and frontend build compile cleanly without regression.

---

# Plan — Remove Redundant Storefront Location Header Banner

## High-Level Strategy
Perform a UI-only deletion of the redundant location header card banner (displaying the store icon, "New Location", and "Active" status badge) situated right above the 2x2 settings grid in `TerminalOperationsWorkspace.jsx` (lines 7643–7729). No backend logic, routing, APIs, form bindings, or other UI components will be modified.

## Goals
- [x] 1. **UI Removal**: Delete the top banner card element (`Selected Location Action Header Card`) sitting above the 2x2 form section grid in the Storefront Locations tab.
- [x] 2. **Preserve Existing Behavior**: Keep all location sidebar cards, 2x2 form input cards (Basic Details, Coordinates, Map & Coverage, Operational Settings), Action Bar buttons (`Clear`, `Add Location`/`Update Location`), and map functionality 100% intact.
- [x] 3. **Contract Test & Build Verification**: Ensure ESLint, Vitest contract tests, and frontend build compile cleanly without regression.

---

# Plan — POS Storefront Locations UI & Layout Redesign

## High-Level Strategy
Redesign the Storefront Locations management UI in `TerminalOperationsWorkspace.jsx` (lines 7507–7608) from the old layout (Picture 1) to closely match the modern dashboard layout of Picture 2. The new interface will organize content into a 2-column master-detail layout: a dedicated Locations list sidebar on the left (`w-full lg:w-80 xl:w-96`), and a structured 2x2 grid of grouped settings cards (Basic Details, Coordinates, Map & Coverage, Operational Settings) on the right.

This is a strictly UI-only change: no backend logic, routing, APIs, MapLibre functionality, validations, field bindings, labels, text, or existing behavior will be modified. All interactive map picker components (`MapPinPicker`) and handlers (`handleSaveLocation`, `handleEditLocation`, `handleSetPrimaryLocation`, `handleDeactivateLocation`, `resetLocationForm`, etc.) will be 100% preserved.

## Goals
- [x] 1. **Header Bar**: Render a soft blue icon badge (`MapPin`), bold title (**Storefront Locations**), subtitle (*Manage your public storefront locations, delivery coverage, and operational settings.*), and top-right Refresh button.
- [x] 2. **Left Locations List Sidebar**: Build a sidebar panel (`lg:col-span-4` / `w-full lg:w-80`) with a count pill badge (`Locations 2`), `+` Add Location button, `Search locations...` filter input, and location cards list featuring radio indicators (`●` / `○`), location name, address, status badges (`Active`, `Open`, `Primary`), radius, wait time, and coordinates.
- [x] 3. **Active Location Header Bar**: Position a top card bar for the selected location displaying location name, status badge (`Active`), and quick action buttons (`Edit`, `Set Primary`, `Deactivate` / `Reactivate`).
- [x] 4. **2x2 Grouped Settings Cards**:
  - **Basic Details**: Location Name *, Address *.
  - **Coordinates**: Latitude *, Longitude *, and info callout pill (*Pinned coordinates: These coordinates are used for delivery coverage and ETA calculations.*).
  - **Map & Coverage**: Map pin toolbar (`Reset View`, `Pin Current Location`, `Adjust Pin`), MapLibre canvas box (Map component untouched), and delivery coverage preview info pill.
  - **Operational Settings**: Delivery Radius (km) *, Wait Time (min) *, and structured checkboxes with subtext (*Open*, *Primary*, *Allow OOS Sales*).
- [x] 5. **Bottom Action Bar**: Render a bottom card bar with title, subtext (*Add a new location or clear the form to start over.*), `Clear` outline button, and `Add Location` / `Update Location` primary button.
- [x] 6. **Contract Test & Build Verification**: Ensure ESLint, Vitest contract tests, and frontend build compile cleanly without regression.

---

# Plan — POS Item Saved Confirmation Modal Redesign

## High-Level Strategy
Redesign the item saved success modal overlay (`savedMessage` state in `TerminalOperationsWorkspace.jsx`) from the old left-aligned card (Picture 1) to match the centered, modern card design of Picture 2. This is a strictly UI-only change: no backend logic, routing, APIs, validation rules, field bindings, text labels, or functionality will be changed. The modal title ID (`pos-items-saved-modal-title`), modal backdrop behavior, and state resets (`setSavedMessage({ name: '', barcode: '', action: 'updated' })`) will be fully preserved.

## Goals
- [x] 1. **Centered Card Container**: Transform the popup layout into a centered rounded white card (`rounded-3xl border border-slate-100 bg-white p-7 sm:p-8 text-center max-w-md w-full shadow-2xl shadow-slate-900/10`).
- [x] 2. **Top Centered Success Badge**: Position a glowing green circular checkmark badge (`h-16 w-16 rounded-full bg-emerald-50 border border-emerald-200/80 shadow-[0_0_20px_rgba(16,185,129,0.18)] text-emerald-600`) at the top center of the card.
- [x] 3. **Title & Subtitle**: Format centered main title ("Item saved successfully" / "Item created successfully") with ID `pos-items-saved-modal-title`, followed by the item update description subtext.
- [x] 4. **Inner Summary Card Box**: Add a rounded inner card (`bg-[#F8FAFC] border border-slate-200/70 p-4 rounded-2xl flex items-center gap-3.5 text-left my-5`) containing a food cloche icon badge on the left, a vertical divider line, the item title, a green status indicator dot (`●`), and the status copy ("Updated in POS and IMS").
- [x] 5. **Centered Navy Action Button**: Replace the right-aligned button with a centered navy blue button ("Got it" / "OK", `bg-[#0B3067] hover:bg-[#072047] text-white font-bold rounded-xl max-w-[200px] w-full h-11`).
- [x] 6. **Contract Test & Build Verification**: Ensure ESLint, Vitest contract tests, and frontend build compile cleanly without regression.

---

# Plan — POS Restoration Loading Screen Redesign

## High-Level Strategy
Redesign the POS workspace startup loading screen in `TerminalPage.jsx` to closely match the provided reference image layout and graphic styling. The new loading screen will feature a centered white card with smooth rounded corners (`rounded-[28px]`), soft backdrop blur overlay, a floating vector POS illustration (monitor screen, cash drawer base, and calculator keypad terminal in a soft blue circular backdrop), bold title ("Restoring POS workspace..."), dynamic status subtext ("Preparing your workspace..."), an animated horizontal blue progress bar (0–100%), a rotating circular spinner, and a smooth fade-in / scale-up / fade-out transition sequence.

All underlying startup logic, hydration hooks, routing, state restoration functions, and contract test assertions will be 100% preserved.

## Goals
- [x] 1. **CSS Animation Keyframes**: Add custom keyframe rules (`pos-overlay-fade-in`, `pos-card-scale-up`, `pos-illustration-float`) to `frontend/src/index.css`.
- [x] 2. **POS Vector Illustration**: Create a crisp, high-fidelity SVG illustration matching the reference image graphic (blue monitor display, cash drawer, and desktop calculator keypad) enclosed within a soft blue circular container (`bg-[#EFF6FF]`).
- [x] 3. **Centered Card & UI Components**: Build the loading screen layout with centered alignment, smooth card box-shadow (`shadow-[0_20px_50px_rgba(0,0,0,0.06)]`), exact title text ("Restoring POS workspace..."), status message subtext, horizontal progress track with animated blue fill bar, and centered circular spinner (`border-[#2563EB] animate-spin`).
- [x] 4. **Full Animation Sequence**: Implement the full lifecycle animation sequence (overlay fade-in, card scale-up, continuous floating illustration, smooth 0–100% progress fill, changing status subtext, and smooth exit fade-out on completion).
- [x] 5. **Contract Test & Build Verification**: Ensure ESLint, Vitest contract tests, and frontend build compile cleanly without regression.

---

# Plan — POS Edit Item Modal UI Layout & Styling Redesign

## High-Level Strategy
Redesign the "Edit Item" modal layout in `TerminalOperationsWorkspace.jsx` (Picture 1) to closely match the updated visual hierarchy and structural 3-column layout of Picture 2. This is a strictly UI-only change: no backend logic, routing, APIs, validation rules, field bindings, labels, text, or functionality will be changed. All element IDs (`pos-items-edit-modal-title`, `pos-items-edit-category`, `pos-items-edit-always-available`, `pos-items-edit-best-seller-mode`, `pos-items-edit-senior-pwd`) and accessibility attributes will be fully preserved.

## Goals
- [x] 1. **Horizontal Top Toggle Cards Row**: Move the 3 toggle cards ("Always Available", "Best Seller", "Senior/PWD Eligible") into a single horizontal 3-column row right below the header. Each card will have a distinct colored icon box on the left (`Package` in blue for Always Available, `Star` in green for Best Seller, `Percent` in purple for Senior/PWD Eligible), title and subtext, and the toggle `Switch` on the right.
- [x] 2. **3-Column Content Layout**: Reorganize the body content below the top toggle row into 3 side-by-side columns on desktop (`grid grid-cols-1 lg:grid-cols-3 gap-5`):
  - **Column 1 (Product Image)**: Wrapped inside a rounded bordered card container (`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`). Contains section title/subtitle, upload dropzone (`pos-item-edit-image`), preview thumbnail, and a bottom notice pill (`Image will be visible in POS and storefront.` with an `Info` icon).
  - **Column 2 (Item Details)**: Wrapped inside a rounded bordered card container (`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`). Stacks Item Name *, Stock Quantity * (with a package box icon prefix inside input), Selling Price * (with ₱ prefix), Cost Price * (with ₱ prefix), and Description / Notes (with character counter `0 / 500`).
  - **Column 3 (Category & QR Section)**: Wrapped inside a rounded bordered card container (`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`). Stacks Food Category * dropdown + helper text on top, and the QR Code card section on the bottom (item name, QR code in white card with share icon overlay, and "Open Storefront item ↗" link).
- [x] 3. **Redesigned Footer Bar**: Replace the dark navy footer with a light white footer bar (`bg-white border-t border-slate-100 px-6 py-4`). Position the notice box with a blue `ShieldCheck` icon ("Changes will update this item across POS and storefront immediately.") on the left, and the Cancel / Save Item action buttons on the right.
- [x] 4. **Contract Test & Build Verification**: Ensure ESLint, Vitest contract tests, and frontend build compile cleanly without regression.

---

# Plan — Food & Beverage (F&B) Saving Menu Item Modal Redesign

## High-Level Strategy
Redesign the "Saving item..." modal overlay portal in `TerminalOperationsWorkspace.jsx` specifically for Food & Beverage (F&B) restaurant POS operations. The new modal will feature warm amber/orange accent highlights, a glassmorphic floating card with a top warm linear shimmer progress bar, a dual orbital counter-rotating ring loader with a glowing F&B culinary emblem (utensils/menu badge), clear F&B micro-copy ("Saving Menu Item...", "Updating food & beverage details and syncing menu changes across POS terminals & Kitchen Displays"), and animated pulse indicators.

## Goals
- [x] 1. Define custom F&B warm accent keyframe animations for shimmer slide and dot pulse in `frontend/src/index.css`.
- [x] 2. Update the `itemSaveInFlight` modal portal in `TerminalOperationsWorkspace.jsx` to use the F&B culinary emblem, warm amber/orange gradient theme, F&B status badge, and F&B menu sync copy.
- [x] 3. Verify that ESLint passes and the frontend builds cleanly.

---

# Plan — Tablet Report Filters 2-Column Grid Layout

## High-Level Strategy
Optimize the visual structure of the Report filters panel (`PosReportsAnalyticsWorkspace.jsx`) on tablet and medium viewports. Instead of stacking Date From, Date To, Range, Cashier, and the Export/Print buttons in a single vertical column, we will change the parent container grid to format as 2 columns on medium screens and above (`md:grid-cols-2`). Since the sub-elements are dissolved into the parent grid via `sm:contents` on screens larger than mobile, this will automatically layout Date From & Date To side-by-side on Row 1, Range & Cashier side-by-side on Row 2, and the Export CSV & Print PDF buttons side-by-side on Row 3. Mobile layout and large desktop layouts will remain fully preserved.

## Goals
- [x] 1. Modify the filters parent container div class in `PosReportsAnalyticsWorkspace.jsx` to include `md:grid-cols-2` (changing `className="grid gap-3 xl:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto_auto]"` to `className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto_auto]"`).
- [x] 2. Update the Range/Cashier subgrid wrapper div to use `grid-cols-2` on mobile (`className="grid grid-cols-2 gap-3 sm:contents"`) to align with the Date From/To mobile layout, ensuring symmetry.
- [x] 3. Verify that ESLint passes and the build compiles cleanly.

---

# Plan — Order Details Card Button Grid Layout (Follow-up 3)

## High-Level Strategy
Further optimize the button layout of the order details card to display as a symmetric 2-column grid when 4 buttons are present (2 buttons in row 1, 2 buttons in row 2). We will dynamic-render buttons as React element items inside an array, and layout them inside a `<div className="grid grid-cols-2 gap-2">` wrapper. If the total number of buttons is odd, the last button will span both columns (`col-span-2`) to keep the layout visually balanced and centered.

## Goals
- [x] 1. Gather all action buttons dynamically into a React elements array inside the render mapping.
- [x] 2. Style the action buttons footer container using `grid grid-cols-2 gap-2`.
- [x] 3. Inject `col-span-2` to the last button when the button count is odd, ensuring visual balance.

---

# Plan — Order Details Card Tablet Adjustments (Follow-up 2)

## High-Level Strategy
Further optimize the order details card layout on tablets to reduce vertical height and prevent button crowding. We will restore the 2-column fields layout on tablets (`md:grid-cols-2`) while keeping label widths narrow (`w-16 md:w-20`) to prevent values from wrapping heavily. We will also allow the action buttons to wrap naturally into balanced rows using a min-width flex layout (`min-w-[125px] flex-1`).

## Goals
- [x] 1. Switch inner card details grid from `xl:grid-cols-2` back to `md:grid-cols-2` so fields layout in 2 columns on tablets/desktops to reduce vertical height.
- [x] 2. Update label width to `w-16 md:w-20` to maximize horizontal space for value text.
- [x] 3. Apply `min-w-[125px] flex-grow flex-1` to all buttons in the footer so they wrap into clean, readable rows (e.g. 2x2 or 2x1) instead of squeezing onto one line.

---

# Plan — Order Details Card Tablet Responsiveness (Follow-up)

## High-Level Strategy
Optimize the order details card responsiveness on tablet viewports to prevent it from looking oversized or cramped. We will adjust the inner details grid to stack vertically in a single column on tablet screens (`grid-cols-1 xl:grid-cols-2`), tighten spacing and padding (`p-4 xl:p-5`), and use a responsive label width (`w-20 sm:w-24`) to ensure values have ample horizontal breathing room on all screens.

## Goals
- [x] 1. Change inner card details grid from `md:grid-cols-2` to `xl:grid-cols-2` so fields stack in 1 column on tablets/mobile and split into 2 columns only on large desktops.
- [x] 2. Tighten card padding from static `p-5` to responsive `p-4 xl:p-5`.
- [x] 3. Use a responsive label width (`w-20 sm:w-24`) to give values more horizontal space on smaller screens.
- [x] 4. Reduce row vertical padding to `py-1.5` for a more compact vertical height on tablets.

---

# Plan — Order Details Card Redesign

## High-Level Strategy
Redesign the order details card within the `Incoming Online Queue` workspace (`IncomingQueueWorkspace` component in `TerminalOperationsPanels.jsx`) to transform it from the old stacked layout (Image A) to a cleaner, structured two-column details layout with properly grouped rows, consistent label/value alignment, visual separators, and a professional hierarchy (Image B). We will preserve all text content, wording, typography, font sizes, font weights, button labels, button sizes, and the overall visual theme.

## Goals
- [x] 1. Restructure the order information card from a single stacked list into a responsive two-column grid layout (`grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2`).
- [x] 2. Group the fields logically to match the reference layout:
  - **Left Column**:
    - **PIN**: with Tag icon, label, and value.
    - **Cashier**: with User icon, label, and value.
    - **Customer**: with User icon, label, and value.
    - **Payment**: with Wallet icon, label, and value.
    - **Payment Status**: with Receipt icon, label, and value.
    - **Collected by**: (if present) with User icon, label, and value.
  - **Right Column**:
    - **Mode**: with ShoppingBag icon, label, and value.
    - **Order Time**: with Calendar icon, label, and value.
    - **Delivery**: (if delivery) with Truck/MapPin icon, label, and value.
    - **Address**: with MapPin icon, label, and value.
- [x] 3. Create structured field rows:
  - Each row will have an icon wrapper: `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500` containing the appropriate Lucide-react icon.
  - The label and value will be aligned using a flex container with a fixed-width label (`w-24 shrink-0`) to ensure all values start at the exact same horizontal position within their column.
  - Add visual separator lines (`border-b border-slate-100 pb-2`) between adjacent rows in each column, matching the reference design.
- [x] 4. Align the "Open pin in map" link dynamically below the two columns (if delivery coordinates exist) and above the buttons.
- [x] 5. Reposition and format the action buttons at the bottom:
  - Put buttons in a single horizontal, responsive row (`flex flex-wrap gap-2 pt-3 border-t border-slate-100`).
  - Add relevant Lucide-react icons inside the buttons:
    - **Start Preparing** / status actions -> Clipboard icon.
    - **Print Order** -> Printer icon.
    - **Open Order** -> ExternalLink icon.
    - **Collect Cash** -> Wallet icon.
  - Re-order utility actions so that "Print Order" appears before "Open Order" to match the target layout (Image B).
- [x] 6. Ensure all styling uses the existing Tailwind CSS configuration, preserving current typography, colors, padding, and text/button sizes.
- [x] 7. Verify the design is responsive (fluidly stacking on mobile and spreading to 2 columns on desktop) and that the code compiles cleanly.

## Logic Flow
Pure UI and layout refactoring:
- **Component**: `IncomingQueueWorkspace` in `frontend/src/features/pos/components/TerminalOperationsPanels.jsx`
- **Render block**: Modify the `order` map loop from line 180 to 260.
- **State/Props**: No changes to props, state, or event handlers (`handleIncomingOrderStatusChange`, `handleOpenCashCollection`, etc. remain intact).

---

# Plan — Compact Apply Discount Modal (Revised)

## High-Level Strategy
Redesign the "Apply Discount" modal to make it ultra-compact and visually neat. We will shrink the modal width to a clean `480px` limit and reorganize the form inputs using a 2-column layout to save vertical space. All control heights, margins, and text sizes will be scaled down to standard desktop/tablet form dimensions.

## Goals
- [x] 1. Reduce modal max-width from `900px` to `480px`.
- [x] 2. Stack icon and text vertically for the 5 discount type cards with a compact height of `h-[48px]`.
- [x] 3. Reorganize fields (e.g. Customer Name and ID Number) into a side-by-side `grid-cols-2` layout on all screens to save a full row of vertical height.
- [x] 4. Reduce input heights from `h-11` to `h-8` (32px) and align icons at `left-2.5 h-3.5 w-3.5`.
- [x] 5. Simplify the "Eligible Items" list: row heights to `min-h-[32px]`, item image size to `h-6 w-6`, and max list height capped at `max-h-28`.
- [x] 6. Reduce financial breakdown panel padding and text size (Total Due to `text-sm`).
- [x] 7. Reduce action buttons height to `h-8` (32px) with `px-3 text-xs`.
- [x] 8. Ensure all existing functional logic, events, and validation behaviors are fully preserved.


## Logic Flow
Pure layout and design refinement:
- Component: `POSCheckoutTerminal.jsx` -> Dialog open state `discountModalOpen`
- Render: DialogContent -> shrink grid options, inputs, labels, eligible items list, and totals table.

---

# Plan — Confirm Checkout Modal & Employee Credit Redesign (Matching Image 2)

## High-Level Strategy
Redesign the "Confirm Checkout" modal layout in `POSCheckoutTerminal.jsx` and `EmployeeCreditPaymentPanel.jsx` to match the clean, professional, high-density layout of Image 2.

Key UI changes:
1. **Fixed Header & Footer with Scrollable Content**: Keep `DialogHeader` and `DialogFooter` fixed at top and bottom (`shrink-0`), ensuring the middle modal body handles scrolling cleanly without double scrollbars or truncated content.
2. **Compact Item Cards with Thumbnails**: Display each item in the sale with a 40x40px rounded thumbnail container (showing image or category SVG icon fallback), item name, quantity x unit price, and right-aligned line total in bold blue.
3. **Card-Style Employee Credit Section**: Transform `EmployeeCreditPaymentPanel.jsx` into a clean card layout with a header icon badge, title/description, compact "Select Employee" combobox trigger with search icon, clear eligibility/balance details, error state with Retry button, and red alert notification box when employee credit is unavailable.
4. **Prevent Dropdown Overlap**: Ensure `PopoverContent` / `Command` dropdown overlays cleanly with high z-index and auto positioning, avoiding content clipping or layout shifts.
5. **Strict UI-Only Preservation**: Preserve all existing text, checkout logic, contract strings, state bindings, APIs, and button behaviors.

## Goals
- [x] 1. **Fixed Modal Layout & Item List Redesign**: Update `DialogContent` in `POSCheckoutTerminal.jsx` with fixed header, scrollable body/items list, item thumbnails, and fixed footer.
- [x] 2. **Employee Credit Card Redesign**: Update `EmployeeCreditPaymentPanel.jsx` with header icon badge, searchable employee combobox, loading/error states with Retry button, balance evidence, and error alert overlay.
- [x] 3. **Remove Redundant Items Header**: Remove the redundant "ITEMS / X items in this sale / PHP XXX" sub-header inside the checkout items box per user request.
- [x] 4. **Contract Test & Build Verification**: Run ESLint and Vitest contract tests (`employeeCredit.contract.test.js`, `employeeCreditPaymentPanel.behavior.test.jsx`) to confirm zero regressions.

---

# Plan — Sidebar Company Name & Branch Name Display

## High-Level Strategy
Add dynamic Company Name (primary text, bold) and Branch Name (secondary text, smaller, muted) directly below the DGFY logo in `TerminalWorkspaceSidebar.jsx`.

Key requirements:
1. **Logo Header Section**: Update the `showBrand` header in `TerminalWorkspaceSidebar.jsx` to render the DGFY logo, followed directly by a centered text container.
2. **Text Formatting**:
   - Primary text: Company Name (`text-[13px] font-extrabold text-[#0F172A] truncate text-center`).
   - Secondary text: Branch Name (`text-[11px] font-semibold text-[#64748B] truncate text-center`).
   - Both texts include `title` attributes and CSS truncation (`truncate`) so long names display an ellipsis without wrapping or pushing navigation buttons down.
3. **Dynamic Resolution**:
   - Company Name resolved from props (`companyName`), `accessibleCompanies` (`is_current` or matching current tenant), or `terminalUser` (`company_name`, `company.name`, `business_name`).
   - Branch Name resolved from props (`branchName`), `locationsState` (matching `operatingLocationId` or `queueLocationScopeId`), `shiftState` (`shift.branch_name`), or `terminalMeta` (`branch_name` / `location_name`).
4. **Prop Wiring**: Ensure `TerminalPageLayout.jsx` passes `operatingLocationId`, `accessibleCompanies`, and `terminalMeta` down to `TerminalWorkspaceSidebar`.
5. **Preservation**: Preserve all existing navigation buttons, auth states, routing, and sidebar width.

## Goals
- [x] 1. **Sidebar Header Component Update (`TerminalWorkspaceSidebar.jsx`)**: Add company and branch resolution logic and render centered truncated text below the DGFY logo.
- [x] 2. **Prop Wiring in Layout (`TerminalPageLayout.jsx`)**: Pass `operatingLocationId`, `accessibleCompanies`, and `terminalMeta` into `TerminalWorkspaceSidebar`.
- [x] 3. **Verification**: Verify visual rendering and run contract tests.

---

# Plan — Optimized Item List Thumbnails in Confirm Checkout Modal

## High-Level Strategy
Upgrade the item list in `POSCheckoutTerminal.jsx` checkout confirmation modal to render downscaled/compressed 40x40px thumbnail variants for every product line.

Key implementation details:
1. **Downscaled & Compressed Thumbnail Resolution**:
   - Extract raw image URL from `line.thumbnail_url`, `line.thumbnail`, `line.storefront_image_url`, `line.image_url`, `line.imageUrl`, or `line.image`.
   - Pass raw image URL through `resolveAssetVariantUrl(rawUrl, 'thumbnail')` to fetch the compressed `/thumb` asset variant instead of full-sized images.
   - Fall back to mapped catalog thumbnail or lightweight vector placeholder icon (`Utensils` in `bg-blue-50/60` container) if image is missing or errors during load.
2. **Fixed Container & Performance Optimization**:
   - Fixed 40x40px container (`h-10 w-10 shrink-0 rounded-lg border border-blue-100 overflow-hidden`).
   - `object-fit: cover` (`object-cover`).
   - `loading="lazy"` and `decoding="async"` for maximum scrolling performance without lag.
3. **Compact Row Formatting**:
   - Left: 40x40px thumbnail container.
   - Middle: Item name (bold, truncated) and `quantity × unit price` subtext.
   - Right: Line total (`PHP XXX.XX` in bold blue).
4. **Preservation**:
   - Keep 100% of existing checkout calculation math, payment validation, APIs, and modal logic intact.

## Goals
- [x] 1. **Thumbnail Resolution & Render Update (`POSCheckoutTerminal.jsx`)**: Use `resolveAssetVariantUrl(..., 'thumbnail')` with `object-cover`, `loading="lazy"`, `decoding="async"`, and vector icon fallbacks.
- [x] 2. **Verification**: Run contract and unit test suites to confirm zero regressions.

---

# Plan — Fix Confirm Checkout Item Thumbnail Image Resolution

## High-Level Strategy
Fix item thumbnail image resolution in `POSCheckoutTerminal.jsx` so product images load correctly in the Confirm Checkout modal instead of falling back to the default knife & fork icon.

Root cause analysis:
1. `resolveMappedPosItemImage` only checked `item?.name`, whereas cart line objects use `line.item_name`.
2. Checkout modal cart items were not cross-referencing `safeCatalog` by `line.item_id`, missing `storefront_image_url`, `pos_image_url`, and variant mappings defined on catalog items.

Key fixes:
1. **Catalog Lookup & Property Normalization**: In the checkout modal `safeCart.map((line) => ...)`, look up the corresponding `catalogItem` from `safeCatalog` (`safeCatalog.find(item => item.item_id === line.item_id)`).
2. **Item Name Support in Image Mapper**: Update `resolveMappedPosItemImage` helper to inspect `item?.name || item?.item_name || item?.itemName`.
3. **Comprehensive Image Variant Resolution**: Resolve downscaled thumbnail URL using `resolveAssetVariantUrl` on `line` or `catalogItem` image properties (`storefront_image_url`, `pos_image_url`, `image_url`, mapped image).
4. **Preservation**: Keep fixed 40x40px rounded container, `object-fit: cover`, `loading="lazy"`, `decoding="async"`, and fallback placeholder behavior.

## Goals
- [x] 1. **Update Image Resolution Helper (`POSCheckoutTerminal.jsx`)**: Support `item_name` property in `resolveMappedPosItemImage`.
- [x] 2. **Catalog Lookup in Checkout Modal (`POSCheckoutTerminal.jsx`)**: Cross-reference `safeCatalog` for cart lines and pass image sources through `resolveAssetVariantUrl(..., 'thumbnail')`.
- [x] 3. **Verification**: Run Vitest contract and behavior tests to verify 100% pass rate.

---

# Plan — Re-align Header Notification Box with Bell Icon

## High-Level Strategy
Fix the positioning of the notification popover panel in `TerminalPageLayout.jsx` so it anchors directly beneath the Bell icon button (`<Bell />`) with its top blue diamond pointer arrow pointing straight into the Bell button instead of pointing at the User Profile menu.

Key changes:
1. **Anchor Notification Panel to Bell Icon**: Update `renderNotificationButton` in `TerminalPageLayout.jsx` to host or anchor the notification dropdown relative to the Bell button container (`relative`).
2. **Centered Popover Alignment**:
   - Align the notification box horizontally (`right-1/2 translate-x-1/2` or `left-1/2 -translate-x-1/2`).
   - Position the blue diamond pointer arrow (`h-5 w-5 rotate-45 bg-[#1A4E8D]`) at the top center of the popover card (`left-1/2 -translate-x-1/2`), pointing directly up into the Bell button.
3. **Screen Boundary Safety**: Use `max-w-[calc(100vw-2rem)]` so the notification box never overflows on smaller viewports.
4. **Preservation**: Retain all notification item click handlers, primary actions, empty states, and dismiss behavior.

## Goals
- [x] 1. **Re-align Popover & Pointer Arrow (`TerminalPageLayout.jsx`)**: Position notification popover and arrow directly under the Bell button.
- [x] 2. **Verification**: Run Vitest tests to confirm zero regressions.

---

# Plan — Fix Notification Dropdown Duplicate Rendering & Add Escape Key Listener

## High-Level Strategy
Eliminate duplicate notification popover rendering in `TerminalPageLayout.jsx` by passing responsive display classes (`compactBellClassName` / `desktopBellClassName`) directly to the outer wrapper `<div>` of `renderNotificationButton`, ensuring only ONE popover is rendered in the DOM at any given viewport breakpoint. Add a global `Escape` key listener to close popovers on keypress.

Root cause of duplicate rendering:
- `renderNotificationButton` used an outer `<div className="relative">` without responsive display classes (`lg:hidden` or `hidden`).
- As a result, both the compact (mobile) and desktop bell wrappers remained active in the DOM simultaneously, rendering two overlapping popover boxes when `notificationsOpen` was set to `true`.

Key fixes:
1. **Apply Responsive Classes to Outer Wrapper**: Pass `className` (`compactBellClassName` / `desktopBellClassName`) to the outer `<div className={className}>` in `renderNotificationButton`, so CSS display rules (`lg:hidden` vs `lg:grid` / `hidden`) hide the hidden bell's container and popover completely.
2. **Escape Key Listener**: Add `useEffect` listener for `Escape` key (`event.key === 'Escape'`) to close the notification popover and company menu automatically when pressed.
3. **Outside Click Handling**: Retain backdrop click overlay (`fixed inset-0 z-[120]`) and `stopPropagation` on popover click.
4. **Preservation**: Retain 100% of notification data, titles, descriptions, badge counts, item actions, and APIs.

## Goals
- [x] 1. **Eliminate Duplicate Popover Rendering (`TerminalPageLayout.jsx`)**: Apply responsive classes to outer wrapper div in `renderNotificationButton`.
- [x] 2. **Add Escape Key Listener (`TerminalPageLayout.jsx`)**: Close popover on `Escape` key press.
- [x] 3. **Verification**: Run Vitest test suite to confirm zero regressions.

---

# Plan — Remove "Discount / No discount applied" Card UI from Current Sale Panel

## High-Level Strategy
Remove the `Discount / No discount applied` card UI from the right-hand Current Sale panel in `POSCheckoutTerminal.jsx` as requested by the user.

Key requirements:
1. **UI Removal Only**: Remove the `<div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2">...</div>` container displaying "Discount" and "No discount applied" / "Remove Discount".
2. **Logic Preservation**: Preserve 100% of existing discount state (`appliedDiscount`), discount calculations, totals deduction, discount approval logic, `Apply Discount` modal/button, and backend payload bindings.
3. **Layout Stability**: Ensure the `Affiliate Code` input and Current Sale totals breakdown transition seamlessly without visual gaps or broken grid styles.

## Goals
- [x] 1. **Remove UI Card (`POSCheckoutTerminal.jsx`)**: Remove the "Discount / No discount applied" container card from the Current Sale sidebar layout.
- [x] 2. **Verification**: Run Vitest test suite to confirm zero regressions in contract tests and build.

---

# Plan — Automatic Legacy Image Compression for POS Item Save & POS Bulk Optimizer

## High-Level Strategy
Add automatic, self-healing image compression directly for the POS terminal when items are updated in POS, plus a 1-command backend bulk optimizer for all 100+ existing POS items. **Zero SKUpervisor usage required.**

Key requirements:
1. **POS Terminal Self-Healing Image Compression**: When an item is edited and saved directly inside the POS terminal (`TerminalOperationsWorkspace.jsx` / `saveEdit`), if its image is an uncompressed legacy raw file, the backend will automatically generate 400px `thumb.webp` variants.
2. **POS Bulk 1-Command Server Optimizer**: Run a single server command to batch-process all 100+ existing POS item images into `thumb.webp` (400px) on disk, updating the POS catalog immediately.
3. **Pure POS Focus**: Everything is integrated into the POS terminal runtime. No SKUpervisor interaction needed.

## Goals
- [x] 1. **POS Item Save Compression**: Ensure POS Edit Item modal (`TerminalOperationsWorkspace.jsx`) triggers backend WebP thumbnail generation on item save.
- [x] 2. **POS Bulk Optimizer**: Batch optimize all 100+ existing POS catalog images into 400px WebP thumbnails on disk so POS catalog cards scroll smoothly without lag.
- [x] 3. **Verification**: Verify POS catalog cards load downscaled thumbnails in `POSCheckoutTerminal.jsx` with 0 network lag.
---

# Plan — Revenue Workspace Admin Authentication Action Button

## High-Level Strategy
Add an actionable `Sign in as Platform Admin` button to the error banner in `TenantRevenueSettlementPanel.jsx` when unauthenticated users or expired sessions access the protected Revenue Workspace, providing a 1-click login path to `/admin`.

## Goals
- [x] 1. **Add Platform Admin Login Action**: Enhance the error banner in `TenantRevenueSettlementPanel.jsx` to render a primary `Sign in as Platform Admin` button when `error` contains `Admin authentication required` or session expiration.
- [x] 2. **Verification**: Run frontend tests and verify clean rendering.
---

# Plan — Services Mode Variations & Add-ons (Phased Implementation)

## High-Level Strategy
Implement service variations (single-select alternative configurations e.g. 30/60/90 min) and add-ons (optional extras e.g. service treatments or physical inventory products) as an independent domain within Services Mode without coupling to F&B modifiers or violating catalog/inventory boundaries.

## Architecture Governance & Decision Citations
- **ADR Amendment**: Amend [ADR 0016](file:///c:/xampp/htdocs/POS-DGFY/docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md) with Services option semantics.
- **Boundaries**: Follow [ARCHITECTURE_BOUNDARIES.md](file:///c:/xampp/htdocs/POS-DGFY/docs/architecture/ARCHITECTURE_BOUNDARIES.md) and [ADR 0029](file:///c:/xampp/htdocs/POS-DGFY/docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md).

## Phased Execution Roadmap

### Phase 0: Contract And Architecture (P0)
- [x] Amend ADR 0016 with service option semantics: variation groups (single-select), add-on groups (single/multi-select), service add-ons (price/duration adjustment, no stock effect), physical add-ons (linked to `item_id`, FIFO stock deduction at fulfillment location).
- [x] Define immutable price, duration, tax, and name snapshot rules for booking lines.

### Phase 1: Additive Database Foundation (P0)
- [x] Create tenant tables via additive migrations: `service_option_groups`, `service_options`, `service_item_option_groups`, `service_booking_line_options`.
- [x] Store group type, selection limits, display order, active state, price/duration adjustments, linked physical `item_id`, tax snapshot, and display names.

### Phase 2: Service Domain & Management APIs (P0)
- [x] Implement backend repositories and use cases in `backend/src/modules/services/`.
- [x] CRUD for option groups/options with validation (duplicate prevention, tenant isolation, linked-item eligibility). Prevent deletion of options referenced by historical bookings (deactivate instead).

### Phase 3: Authoritative Pricing & Availability (P0)
- [x] Server-side quote and duration recalculation: `final_price = base_price + option_adjustments`, `final_duration = base_duration + duration_adjustments`.
- [x] Include selected options in resource/provider availability checks and hold request hashes. Reject tampered client-provided adjustments.

### Phase 4: Booking Persistence & Idempotency (P0)
- [x] Extend single/batch booking contracts to accept option IDs. Normalize and include option IDs in idempotency hashes.
- [x] Persist immutable option snapshots and separate stock-bearing lines for physical add-ons in an all-or-nothing database transaction.

### Phase 5: Services Management UI (IMS) (P1)
- [x] Add "Variations and Add-ons" tab/section to IMS Service create/edit form.
- [x] Support option group creation (type, selection limits, required flag, price/duration adjustments).
- [x] Support assigning/unassigning option groups to service catalog items. on active bookings.

### Phase 6: Storefront Booking UI (P1)
- [ ] Display variations before time-slot selection (since duration affects availability).
- [ ] Render add-ons with dynamic price/duration adjustments and server-authoritative quote refresh.

### Phase 7: POS, Settlement, Receipt, And Reports (P1)
- [ ] Display selected options in POS booking detail drawer.
- [ ] Include option snapshots in settlement transaction lines. Deduct physical add-ons via location-scoped FIFO.
- [ ] Print option names and price breakdown on tickets and receipts. Separate service, variation, add-on, and physical cost reporting.

### Phase 8: Security, Performance, & Release Hardening (P0)
- [ ] Tenant/permission guards on every endpoint, bounded query limits, and N+1 query elimination via batched option loading.
- [ ] Feature flag gating (`SERVICES_VARIATIONS_ENABLED`) and end-to-end Playwright, Vitest, and migration validation.

---

# Plan — Responsive 3×2 Current Sale Action Buttons Grid

## High-Level Strategy
Redesign the "Current Sale" action buttons panel in `POSCheckoutTerminal.jsx` and `index.css` into a balanced, responsive 3×2 grid layout (3 columns on standard/desktop screens, switching automatically to 2 columns on smaller screens).

All 6 action buttons:
1. **Checkout** (Primary blue button, `ShoppingCart` icon)
2. **Print Order** (`Printer` icon)
3. **Close Day / Z-Reading** (`Gauge` icon)
4. **Print Last Receipt** (`Printer` icon)
5. **Open Cash Drawer** (Drawer icon/text)
6. **Apply Discount** (`Apply Discount` text)

Will occupy equal-width and equal-height grid slots with consistent spacing (`gap-2`), centered icons and text, multi-line label wrapping up to 2 lines (`line-clamp-2`), and zero clipping or overflow.

All backend logic, click handlers, disabled states, labels, icons, and button colors remain 100% unchanged.

## Goals
- [x] 1. **Responsive 3×2 Grid Layout**: Update `.dgfy-pos-current-sale-actions` in `POSCheckoutTerminal.jsx` to render a 3×2 grid (`grid-cols-2 sm:grid-cols-3 gap-2`) with equal slot sizing.
- [x] 2. **Equal Sizing & Multi-Line Centered Content**: Ensure all 6 buttons share identical dimensions (`h-11`/`h-12` or equal height), centered flex contents, up to two-line label text, and zero overlapping or clipping inside the Current Sale panel.
- [x] 3. **CSS & Contract Test Updates**: Adjust media queries in `index.css` and contract test assertions in `terminalResponsiveScroll.contract.test.js` to match the 3×2 grid layout.
- [x] 4. **Verification**: Run ESLint, contract tests, and verify production build.

---

# Plan — Fluid Responsive Auto-Scaling Current Sale Action Buttons

## High-Level Strategy
Refine the Current Sale action buttons in `POSCheckoutTerminal.jsx` to dynamically auto-scale typography, spacing, icon alignment, and button heights across narrow, medium, and wide sidebars.

Key refinements:
1. **Vertical Icon-Over-Text Stacking (`flex-col items-center justify-center`)**: Stack icons cleanly above label text (`size={14}` icon with `mb-0.5`) to eliminate horizontal crowding in narrow grid columns (~80-90px width).
2. **Fluid Typography & Line Height**: Use fluid text sizes (`text-[10px] sm:text-[11px] xl:text-xs leading-[1.15] text-center`) with `break-words` and `min-w-0` to ensure labels like "Close Day / Z-Reading" and "Print Last Receipt" wrap cleanly into 2 lines without clipping icons or text.
3. **Dynamic Height Container (`min-h-[46px] h-full py-1.5 px-1`)**: Replace rigid `h-11` (44px) fixed heights with flexible `min-h-[46px]` so buttons expand or scale fluidly to prevent vertical clipping on any panel width.
4. **Preserve All Behavior**: Keep all 6 buttons, colors, icons, click handlers, disabled states, and backend logic 100% intact.

## Goals
- [ ] 1. **Vertical Stacking & Responsive Spacing**: Refactor action buttons to use vertical icon/text stacking (`flex-col items-center justify-center py-1.5 px-1`) with `min-h-[46px]`.
- [ ] 2. **Fluid Multi-Line Typography**: Apply `text-[10px] sm:text-[11px] xl:text-xs leading-[1.15] text-center break-words` to eliminate text clipping, 3-line overflow, or icon displacement.
- [ ] 3. **Contract Test & Build Verification**: Update Vitest contract tests and run production build to verify zero regressions.



---

# Plan — Services and F&B Workflow Separation

## High-Level Strategy
Split the Current Sale workflow into distinct Food & Beverage (F&B) and Services modes, using a centralized workflow resolver to define authoritative POS behavior. Ensure no cross-contamination of mode-specific fields or statuses.

## Goals

### Phase 0 — Define the Workflow Contract
- [x] Define authoritative contract for F&B (Order, Dine In/Takeout/Pickup/Delivery) and Services (Booking, Walk-in/Appointment).
- [x] Establish that Walk-in behavior maps to a current-time booking.
- [x] Ensure no Services workflow depends on restaurant order_method.

### Phase 1 — Add a Central Workflow Resolver
- [x] Create resolvePosWorkflow(workflowMode) providing mode, transactionRecord, allowedMethods, and capabilities.
- [x] Pass workflowMode into both checkout terminals.
- [x] Remove hardcoded dine_in default and use the resolver.

### Phase 2 — Split the Current Sale Controls
- [x] Maintain shared cart items, discounts, taxes, and totals in the Current Sale card.
- [x] Build FnbWorkflowPanel displaying Order Methods, Table, Guest Count, Kitchen Notes, and Order Status.
- [x] Build ServicesWorkflowPanel displaying Walk-in/Appointment, Client, Provider, Resource, Date/Time, Duration, and Booking Status.
- [x] Isolate mode-specific controls completely.

### Phase 3 — Connect Service Variations and Add-ons
- [x] Allow selection of service variations (single-select) and add-ons (multi-select).
- [x] Send selected option IDs to backend to calculate final price and duration (Server Authority).
- [x] Ensure physical add-ons check and deduct inventory.

### Phase 4 — Implement Booking and Payment Flow
- [x] Create Walk-in and Appointment booking flows.
- [x] Enforce backend validation for provider/resource availability and conflict rejection.
- [x] Handle booking, payment, options, and physical add-ons transactionally with idempotency.

### Phase 5 — Add Mode-Specific Navigation
- [x] Restrict navigation to mode-relevant pages using capability configuration or route guards.
- [x] F&B hides Services pages; Services hides F&B pages.

### Phase 6 — Update Tickets, Receipts, History, and Reports
- [x] Separate operational service tickets from financial payment receipts.
- [x] Update Services history to show booking references and providers.
- [x] Add Service-specific metrics (revenue by provider, utilization) to Reports.

### Phase 7 — Responsive UI Validation
- [x] Ensure side-by-side layout on desktop.
- [x] Adjust form rows and Current Sale panels for tablet and mobile viewports.

### Phase 8 — Testing and Release Gate
- [x] Write tests for Workflow Resolver, F&B flow, Services flow, and integrations.
- [x] Ensure all playwright, frontend, and backend tests pass before completion.


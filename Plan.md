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

# Plan — Compact Apply Discount Modal (Revised)

## High-Level Strategy
Redesign the "Apply Discount" modal to make it ultra-compact and visually neat. We will shrink the modal width to a clean `480px` limit and reorganize the form inputs using a 2-column layout to save vertical space. All control heights, margins, and text sizes will be scaled down to standard desktop/tablet form dimensions.

## Goals
1. Reduce modal max-width from `900px` to `480px`.
2. Stack icon and text vertically for the 5 discount type cards with a compact height of `h-[48px]`.
3. Reorganize fields (e.g. Customer Name and ID Number) into a side-by-side `grid-cols-2` layout on all screens to save a full row of vertical height.
4. Reduce input heights from `h-11` to `h-8` (32px) and align icons at `left-2.5 h-3.5 w-3.5`.
5. Simplify the "Eligible Items" list: row heights to `min-h-[32px]`, item image size to `h-6 w-6`, and max list height capped at `max-h-28`.
6. Reduce financial breakdown panel padding and text size (Total Due to `text-sm`).
7. Reduce action buttons height to `h-8` (32px) with `px-3 text-xs`.
8. Ensure all existing functional logic, events, and validation behaviors are fully preserved.

## Logic Flow
Pure layout and design refinement:
- Component: `POSCheckoutTerminal.jsx` -> Dialog open state `discountModalOpen`
- Render: DialogContent -> shrink grid options, inputs, labels, eligible items list, and totals table.

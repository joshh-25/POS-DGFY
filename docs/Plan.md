# Plan — Redesign Add POS Item Modal & Adapt Senior Discount Toggle (Updated: Completed)

## 1) Objective
Redesign the "Add POS Item" modal layout in the POS Management Panel to match the target UI/UX design (side-by-side fields grid layout). Adapt and style the "Senior/PWD Eligible" toggle switch to be consistent with the design layout and pass the item discount eligibility contract tests. Enforce a strict single-image upload limit per item, update the image selection UI to match the mockup, and **remove the Barcode notification card entirely**.

Key Changes:
1. `[x]` Arrange **Item Name** and **Food Category** side-by-side (remove full-width spans).
2. `[x]` Keep **Stock Quantity** and **Always Available** side-by-side.
3. `[x]` Keep **Selling Price** and **Cost Price** side-by-side.
4. `[x]` Keep **SKU (POS Rule)** on the left (col 1).
5. `[x]` **Delete the Barcode card notification box entirely** from the create modal.
6. `[x]` Place **Senior/PWD Eligible** toggle in its own clean card layout matching **Always Available** toggle, placed below SKU.
7. `[x]` Make sure Description / Notes spans full-width at the bottom.
8. `[x]` Correct the label in the main inventory manager `ItemFormModal.jsx` from "Senior/PWD Discount Eligible" to "Senior/PWD Eligible" to pass contract tests.
9. `[x]` Wire `aria-checked` attributes correctly to the Switch elements in `TerminalOperationsWorkspace.jsx`.
10. `[x]` **Single Image Upload Enforcement**:
    - Limit creation/editing image inputs to exactly 1 image per item.
    - Restyle the image upload container to be a clickable dashed `<label>` with a clean layout containing instructions.
    - Render the selected/existing image preview directly below the upload box with a close/delete button.
    - Automatically replace the previous image when a new image is selected in both the create and edit flows.

---

## 2) Critical Assessment & Logic Integrity
- **No Functional Logic Disruption**: The item creation endpoint, state hooks, and image uploads will remain unchanged.
- **Single Image Replacement**: For edit mode, selecting a new image automatically triggers deletion of the old image before uploading the new one, keeping catalog integrity clean.
- **Aesthetic Consistency**: The UI will use vanilla Tailwind CSS classes mapped to the existing theme (`bg-slate-50`, `border-slate-200`, `rounded-xl`, `font-bold text-[#0F172A]`).

---

## 3) Proposed Technical Changes

### Frontend - POS Terminal Operations Workspace
#### [MODIFY] [TerminalOperationsWorkspace.jsx](file:///c:/xampp/htdocs/POS-DGFY/frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx)
- **Imports**: Add `Upload` to Lucide-react imports list.
- **Creation Modal Image Section**:
  - Restructure creation modal image upload zone to be a single-click label with nested guidelines.
  - Render preview block below upload zone if `selectedImageFiles.length > 0`.
  - Disable multiple selection and slice incoming files to keep only the first selected image.
- **Edit Modal Image Section**:
  - Restructure edit modal image zone similarly to match the create modal.
  - Delete any old image during new upload in `handleUploadStorefrontImage`.
- **Add POS Item Modal Form (under `showCreateModal`)**:
  - Remove `sm:col-span-2` from the outer wrapper of Item Name.
  - Remove `sm:col-span-2` from the outer wrapper of Food Category.
  - **[DELETE]** Barcode notification box container wrapper (`div` with `Barcode` icon and explanation).
  - Add `aria-checked={createForm.senior_pwd_discount_eligible}` to the `Switch` component inside the "Senior/PWD Eligible" toggle container.
  - Place "Senior/PWD Eligible" container directly after SKU inside the grid (occupying the right column next to SKU on desktop).
- **Edit POS Item Modal Form (under `activeEditItem`)**:
  - Remove `sm:col-span-2` from the outer wrapper of Item Name.
  - Remove `sm:col-span-2` from the outer wrapper of Food Category.
  - Add `aria-checked={editForm.senior_pwd_discount_eligible}` to the `Switch` component inside the "Senior/PWD Eligible" toggle container.
  - Align fields to match the side-by-side layout of the create form.

### Frontend - Inventory Item Form Modal
#### [MODIFY] [ItemFormModal.jsx](file:///c:/xampp/htdocs/POS-DGFY/frontend/Components/items/ItemFormModal.jsx)
- Change `<Label>` text from `"Senior/PWD Discount Eligible"` to `"Senior/PWD Eligible"` to satisfy the contract test assertions.

---

## 4) Verification Plan
### Automated Verification
- Run the item discount contract test to check for success:
  `powershell -ExecutionPolicy Bypass -Command "npx vitest run src/features/pos/__tests__/itemDiscountEligibility.contract.test.js"`
- Verify that other POS workspace and inventory test suites pass.

### Manual Verification
- Open the "Add POS Item" modal and verify:
  - Header has correct close button.
  - Two-column split layout: Left image upload/preview, right fields.
  - Right fields grid:
    - Row 1: Item Name (left) | Food Category (right)
    - Row 2: Stock Quantity (left) | Always Available (right)
    - Row 3: Selling Price (left) | Cost Price (right)
    - Row 4: SKU (POS Rule) (left) | Senior/PWD Eligible (right)
    - Row 5: Description / Notes (full width)
- Open the "Edit Item" modal and verify consistent layout.

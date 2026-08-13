# DGFY Standalone POS — Button and Workflow Catalog

## Scope

This document covers only the standalone application rooted at:

`C:\xampp\htdocs\POS-DGFY\frontend\apps\pos`

The standalone shell reuses terminal business components from `frontend/src/features/pos`. Those shared components are included only when rendered by this DGFY POS app. The SKUpervisor application, integrated `/pos` page, IMS navigation, and SKUpervisor administration modules are excluded.

Buttons vary by role, permission, business mode, active shift, terminal pairing, subscription, and record state. A control described as conditional is not shown to every user.

## Application routes

- **`/`, `/terminal`, `/login`** — open the standalone DGFY POS terminal.
- **`/sales`** — redirects to the SKUpervisor Sales page because that report is handled outside the standalone app.
- **Unknown route > Open POS Terminal** — returns to `/terminal`.

## Main POS navigation

### Sell

**Purpose:** Displays POS Items and Current Sale so the cashier can build and complete a transaction.

- **Sell** — opens the live catalog and cart. It requires an unlocked terminal and either an active shift or authorized admin navigation.

### History

**Purpose:** Displays completed POS transactions, filters, invoice details, and receipts.

- **History** — opens invoice lookup and the transaction audit trail. It requires POS view permission.

### Report

**Purpose:** Displays standalone POS sales analytics. Hidden from cashier-only roles.

- **Report** — opens daily, monthly, yearly, comparison, profit/loss, payment, cashier, discount, and top-item analytics.

### Items

**Purpose:** Displays the store item catalog. Cashiers receive a view-oriented workspace; authorized users can create, edit, and delete items.

- **Items** — opens the standalone item workspace.

### Orders

**Purpose:** Displays incoming online/storefront orders and their operational
history. Shown only for eligible retail, F&B, and counter workflows when the
incoming queue is available. Services uses its booking workspace and does not
show or poll this queue.

- **Orders (count)** — opens the incoming order queue. The count is the current number of incoming orders.
- **Active Queue** — shows orders that still need fulfillment action (`placed`, `confirmed`, `preparing`, `ready_for_pickup`, or `out_for_delivery`).
- **Order History** — shows rejected, cancelled, and completed-but-unpaid online orders that are intentionally excluded from Sales History.

### Shift

**Purpose:** Opens and monitors cashier shifts, changes shift location, records drawer adjustments, and closes shifts.

- **Shift** — opens Shift Location, Close Shift, and Cash Drawer tabs.

### Settings

**Purpose:** Opens profile, POS setup, terminal, discount, storefront, and location tools. Shown only to users with advanced-operation access.

- **Settings** — opens the appropriate settings section.

### Session controls

- **Unlock Terminal** — opens authentication/PIN controls and restores access after successful verification.
- **Lock Terminal** — locks the POS without closing the active shift.
- **Show/Hide Sidebar** — expands, collapses, opens, or closes navigation depending on screen size.
- **Open Notifications** — displays current incoming-order and POS notifications.

## Sell workflow

### POS Items

**Purpose:** Finds sellable items and adds them to the current transaction.

- **Search field** — filters items using the entered name, SKU, or supported barcode identity.
- **Backspace Search** — removes the last search character.
- **Scan** — opens the barcode scanner/manual barcode dialog.
- **Show/Hide Catalog Filters** — expands or collapses folder/category filters.
- **All Items** — removes folder filtering and shows the full available catalog.
- **Folder/Category button** — filters the catalog to the selected folder.
- **Clear** — removes the selected folder filter.
- **Retry** — reloads folders after a loading failure.
- **Item card** — adds one unit of the selected item to Current Sale. Items blocked by availability, stock, or configuration cannot be sold.
- **Item image** — opens the larger image preview when that behavior is available.
- **Previous** — opens the previous catalog page.
- **Next** — opens the next catalog page.

### Barcode scanner

- **Scan/Open Scanner** — opens camera/manual barcode entry.
- **Submit/Find Item** — resolves the barcode and adds or locates the matching item.
- **Cancel** — closes the scanner without selecting an item.
- **X/Close Barcode Modal** — closes the scanner dialog.

### Current Sale

**Purpose:** Shows the active cart and calculated transaction totals.

- **Current Sale Help** — shows or hides guidance for the cart area.
- **Close Current Sale Panel** — closes the cart drawer on mobile layouts.
- **Current Sale/Summary** — opens the cart drawer on mobile layouts.
- **Minus** — decreases the selected line quantity by one; the line is removed or stopped at its allowed minimum.
- **Plus** — increases the selected line quantity, subject to stock and quantity rules.
- **Remove** — removes the selected cart line.
- **Remove Discount** — clears the currently applied discount.
- **Apply Discount** — opens governed discount selection.
- **Print Order** — prints a non-final order slip before payment.
- **Checkout** — opens the checkout confirmation and payment controls.
- **Close Day** — starts shift/day closing for an authorized operator.

### Discount dialog

- **Discount profile/selection** — chooses the configured discount.
- **Cancel** — closes the dialog without changing the current discount.
- **Apply Discount** — verifies required authorization and applies the selected governed discount.

### Checkout confirmation

**Purpose:** Confirms payment and records the transaction.

- **Payment method controls** — select the supported payment method and capture required payment values.
- **X/Close Checkout Confirmation** — returns to the cart without recording the transaction.
- **Cancel** — returns to the cart without recording the transaction.
- **Confirm Checkout/Complete Sale** — validates terminal pairing, cashier access, active shift, location, cart, stock, payment, discount, and compliance rules; then records the sale and creates the receipt.

### Receipt and last-sale actions

- **Print Receipt** — sends the last or selected receipt to the configured printer path.
- **Open Drawer** — requests the connected cash drawer to open.
- **Open in Sales Report** — redirects the matching transaction to SKUpervisor Sales; the destination application is outside this document.
- **Receipt Preview** — opens the most recent receipt.
- **Close Receipt Preview** — closes the preview.
- **Go to History** — switches to History.
- **Print from Receipt Preview** — prints the receipt currently being viewed.
- **Close Setup Snapshot** — closes POS setup information shown during a blocked/diagnostic checkout state.
- **Cancel Image Preview** — closes the item-image preview.

## History workflow

**Purpose:** Searches and audits financially recognized standalone POS sales;
voided transactions remain available through the dedicated voided view, while
local pending-sync transactions stay visible from the terminal queue.

- **Sync Pending Transactions** — retries local/offline transactions waiting to reach the backend.
- **Reset** — clears all history filters.
- **Apply Filters** — reloads history using date, location, cashier, store/source, and search filters.
- **View Receipt** — opens the selected transaction receipt; receipt printing
  remains a separate action inside the receipt view and is not a sales-list
  status.
- **Row** — opens/selects the row in compact layouts.
- **First (`«`)** — moves to the first history page.
- **Previous (`‹`)** — moves to the previous page.
- **Next (`›`)** — moves to the next page.
- **Last (`»`)** — moves to the last page.
- **Print Receipt** — prints the selected historical receipt.

## Report workflow

**Purpose:** Reviews sales performance without exposing the full SKUpervisor reporting system.

- **Daily** — shows daily summary, transactions, payments, discounts, cashiers/shifts, and top-selling items.
- **Monthly** — shows monthly trend and best-selling items.
- **Yearly** — shows yearly breakdown and best sellers.
- **Comparison** — compares selected periods.
- **Profit/Loss** — displays POS revenue, cost, and profit/loss calculations.
- **Report section buttons** — switch the active analytics section.
- **Export CSV** — downloads the active report dataset.
- **Print / Save PDF** — opens the print dialog, where the report can be printed or saved as PDF.

## Items workflow

**Purpose:** Reviews and, for authorized non-cashiers, maintains items used by the POS.

### Catalog controls

- **Search Items** — opens the item-search input.
- **Close Search** — closes and clears the search UI.
- **Folder/Category button** — filters the item list.
- **Previous/Next page** — moves through item results.
- **Add Item/Create Item** — opens the create-item dialog.
- **Edit Item** — opens the selected item editor; restricted by role/permission.
- **Delete Item** — opens deletion confirmation; restricted by role/permission.
- **View item/image controls** — opens the selected item or image where provided.

### Create item

- **Image upload/select** — selects a POS/storefront item image.
- **Remove selected image** — removes the pending image.
- **Cancel** — closes create mode without saving.
- **Create Item** — validates required item fields, creates the item, and persists selected assets.

### Edit item

- **Image upload/select** — replaces or adds the item image.
- **Remove image** — removes the selected existing/pending image.
- **POS visibility control** — changes whether the item appears in the POS catalog.
- **Storefront visibility control** — changes whether the item appears online.
- **Cancel** — closes without saving the pending edits.
- **Save** — validates and persists item, pricing, cost, visibility, and asset changes.

### Delete confirmation

- **Cancel** — keeps the item.
- **Delete/Confirm** — deletes an eligible item after confirmation.
- **OK** — closes success feedback after save or delete.

## Incoming Orders workflow

**Purpose:** Accepts, rejects, and advances online orders.

- **Active Queue** — switches to active fulfillment orders.
- **Order History** — switches to the read-only operational history of rejected, cancelled, and unpaid online orders.
- **Refresh Orders** — reloads incoming orders.
- **Refresh History** — reloads Order History using the selected filters.
- **Apply Filters** — searches Order History by invoice number, fulfillment status, and payment status.
- **Previous/Next order history page** — moves through the paginated exception-order list while preserving the active filters.
- **Accept/Reject/status action** — changes the selected order to the chosen valid status.
- **Open Receipt** — opens the order receipt.
- **View Order** — opens the selected historical order details without changing its status or payment state.
- **Open History** — opens transaction history for the order.
- **Order row/card** — selects or expands the order where supported.

## Shift workflow

### Shift Location tab

- **Shift Location** — opens current shift identity, business date, opening float, expected cash, cash sales, and location information.
- **Open Shift** — validates opening float, note, terminal, location, and permission, then creates the cashier shift.
- **Change Shift Location** — reassigns an active shift to the selected location; a reason and permission are required.
- **Refresh Shift Data** — reloads current shift and cash summary.

### Close Shift tab

- **Close Shift tab** — opens closing cash and note fields.
- **Open Shift** — appears here when no shift exists and starts a shift after validation.
- **Close Shift** — submits closing cash and note and starts the close confirmation/processing flow.
- **Cancel** — closes the close-shift confirmation without closing the shift.
- **Confirm Close Shift** — finalizes shift closing and records variance/reconciliation values.

### Cash Drawer tab

- **Cash Drawer** — opens drawer event recording.
- **Event Type** — chooses Cash In, Cash Out, Opening Adjustment, or Closing Adjustment.
- **Record Cash Event** — validates amount/reason and adds the auditable drawer event to the active shift.

### Shift-opening prompts

- **Skip for Admin** — lets an authorized administrator browse allowed POS areas without opening a cashier shift; checkout remains blocked.
- **Open/Start Shift** — submits the opening float and note.

## Settings workflow

### Profile Setting

- **Profile Setting** — opens account/profile fields.
- **Generate Password** — generates a strong password where password editing is available.
- **Request/Send OTP** — sends email verification before protected profile changes.
- **Save Profile** — validates and saves the profile.

### POS Setup

- **POS Setup** — opens receipt, cashier, terminal, discount, and POS policy configuration.
- **Save POS Settings** — validates and persists POS behavior settings.
- **Clear PIN** — removes the configured POS access PIN after required authorization.
- **Add Terminal** — adds a terminal registry entry.
- **Terminal Options (`...`)** — opens actions for the selected terminal.
- **Save and Pair** — verifies the terminal and pairs the current device.
- **Delete Terminal** — removes the selected terminal registration.
- **Invite DGFY Cashier** — opens the cashier invitation dialog.
- **Send Invitation** — sends the invitation using the selected role/access values.
- **Add Discount** — adds a discount profile row.
- **Remove Discount Profile** — removes the selected profile row.

### Storefront

- **Storefront** — opens storefront identity, content, access mode, business hours, and location configuration.
- **Upload Cover/Profile Image** — selects and uploads the chosen storefront asset.
- **Remove Cover/Profile Image** — removes the saved asset.
- **Add Category** — adds a storefront category row.
- **Remove Category** — removes the corresponding row.
- **Add Why Choose Us entry** — adds a marketing-reason row.
- **Remove Why Choose Us entry** — removes the corresponding row.
- **Add Gallery Image** — adds a gallery configuration row.
- **Remove Gallery Image** — removes the corresponding row.
- **Add Delivery Partner** — adds a delivery-partner row.
- **Remove Delivery Partner** — removes the corresponding row.
- **Add Review Highlight** — adds a review-highlight row.
- **Remove Review Highlight** — removes the corresponding row.
- **Business Hours controls** — add, copy, enable, disable, or edit daily schedules as shown.
- **Save Storefront** — validates and saves storefront settings.

### Storefront locations

- **Refresh Locations** — reloads location records.
- **Add Location** — validates and creates a location/map pin.
- **Update Location** — saves changes to the selected location.
- **Clear** — resets the location form.
- **Edit** — loads the selected location into the form.
- **Set Primary** — makes the location the primary storefront location.
- **Deactivate** — hides/disables an active location without deleting it.
- **Reactivate** — restores an inactive location.
- **Delete Pin** — starts permanent location deletion.
- **Cancel** — cancels the pending location action.
- **Confirm Deactivate/Delete** — completes the explicitly selected location action.

### Settings error and validation controls

- **Retry** — reloads settings after a loading failure.
- **Review Fields/OK** — closes validation feedback so the user can correct highlighted fields.

## Terminal onboarding and pairing

**Purpose:** Completes required setup before the POS can operate normally.

- **Step indicator** — opens an available onboarding step.
- **Invite DGFY Cashier** — opens cashier invitation.
- **Remove Terminal** — removes a pending terminal row.
- **Pair Device** — pairs the current device to the selected terminal.
- **Add Terminal** — adds another terminal row.
- **Save Terminals** — saves terminal registry entries.
- **Add Another Location** — starts a new location form.
- **Location card** — selects a location for editing.
- **Save/Add/Update Location** — persists the location and map pin.
- **Skip for Now** — postpones an optional setup step.
- **Back** — returns to the previous setup step.
- **Open in Settings** — opens the current configuration area in Settings.
- **Continue** — advances onboarding after the current requirements are satisfied.
- **Continue Onboarding** — resumes an incomplete setup flow from the terminal banner.

## Terminal lock and account linking

- **Unlock** — verifies the entered PIN/account and unlocks the terminal.
- **Use Different Account** — exits the current unlock identity and starts another sign-in path.
- **Cancel/Close** — closes the unlock drawer where allowed.
- **Dismiss DGFY Account Link Reminder** — hides the legacy account-link banner.
- **Request Link OTP** — sends the verification code needed to link the account.
- **Create DGFY Account** — starts DGFY account registration.
- **Link Account** — verifies the OTP and links the existing account.
- **Cancel** — exits the account-link flow.

## Alerts and hardware messages

- **Notification item** — opens the related order or alert context.
- **Dismiss** — closes the stock alert summary.
- **View Items** — opens Items filtered/relevant to the stock alert.
- **Close Hardware Message (`X` or Close)** — closes printer, drawer, scanner, or device-bridge feedback.

## Primary end-to-end flows

1. **Start work:** Unlock Terminal → Shift → enter Opening Float → Open Shift.
2. **Make a sale:** Sell → search/scan/select POS Item → adjust Current Sale → optional Apply Discount → Checkout → select payment → Complete Sale → Print Receipt/Open Drawer.
3. **Review a sale:** History → set filters → Apply Filters → View Receipt → Print Receipt.
4. **Handle online order:** Orders → Active Queue → Refresh → select order → Accept/Reject/advance status → Open Receipt or History.
5. **Review an unpaid or rejected online order:** Orders → Order History → set filters → Apply Filters → View Order.
5. **Adjust drawer cash:** Shift → Cash Drawer → select event type → enter amount/reason → Record Cash Event.
6. **End work:** Shift → Close Shift → enter closing cash/note → Close Shift → Confirm Close Shift.
7. **Configure terminal:** Settings → POS Setup → Add Terminal → Save and Pair → configure discounts/receipt/PIN → Save POS Settings.

## Important restrictions

- Selling and checkout normally require an unlocked, paired terminal and active shift.
- Admin shift bypass allows browsing but does not make checkout valid.
- Cashiers do not see the Report module and cannot use privileged item/settings actions.
- POS view, transact, close-day, cash-drawer, location-switch, and settings permissions independently control actions.
- Incoming Orders appears only when the tenant/storefront mode supports the
  queue. It is intentionally absent in Services, where appointments and
  walk-ins use the Services booking lifecycle.
- The standalone `/sales` route and **Open in Sales Report** intentionally hand off to SKUpervisor; no SKUpervisor functions are included here.

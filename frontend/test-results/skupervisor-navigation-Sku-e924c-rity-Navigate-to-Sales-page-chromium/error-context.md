# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: skupervisor\navigation.spec.js >> Skupervisor Navigation and Layout Integrity >> Navigate to Sales page
- Location: tests\e2e\skupervisor\navigation.spec.js:29:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /Sales/i }).or(locator('h1, h2'))
Expected: visible
Error: strict mode violation: getByRole('heading', { name: /Sales/i }).or(locator('h1, h2')) resolved to 2 elements:
    1) <h1 class="text-2xl font-semibold text-slate-900">Sales Timeline</h1> aka getByRole('heading', { name: 'Sales Timeline' })
    2) <h2 class="text-lg font-semibold text-slate-900">Tenant Onboarding Setup</h2> aka getByRole('heading', { name: 'Tenant Onboarding Setup' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /Sales/i }).or(locator('h1, h2'))

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications alt+T":
    - list:
      - listitem [ref=e3]:
        - img [ref=e5]
        - generic [ref=e8]: Unknown column 'PosTransaction.cash_received' in 'field list'
      - listitem [ref=e9]:
        - img [ref=e11]
        - generic [ref=e14]: Unknown column 'PosTransaction.cash_received' in 'field list'
  - generic [ref=e15]:
    - complementary [ref=e16]:
      - generic [ref=e18]:
        - img "DGFY.PH" [ref=e19]
        - paragraph [ref=e20]: Business
      - navigation [ref=e21]:
        - link "Dashboard" [ref=e22] [cursor=pointer]:
          - /url: /
          - img [ref=e23]
          - generic [ref=e28]: Dashboard
        - link "Items" [ref=e29] [cursor=pointer]:
          - /url: /items
          - img [ref=e30]
          - generic [ref=e34]: Items
        - link "Suppliers" [ref=e35] [cursor=pointer]:
          - /url: /suppliers
          - img [ref=e36]
          - generic [ref=e41]: Suppliers
        - link "Purchase Orders" [ref=e42] [cursor=pointer]:
          - /url: /purchase-orders
          - img [ref=e43]
          - generic [ref=e46]: Purchase Orders
        - link "Job Orders" [ref=e47] [cursor=pointer]:
          - /url: /job-orders
          - img [ref=e48]
          - generic [ref=e50]: Job Orders
        - link "Dispatch Orders" [ref=e51] [cursor=pointer]:
          - /url: /dispatch-orders
          - img [ref=e52]
          - generic [ref=e57]: Dispatch Orders
        - link "POS Terminal" [ref=e58] [cursor=pointer]:
          - /url: /pos
          - img [ref=e59]
          - generic [ref=e63]: POS Terminal
        - link "Sales" [ref=e64] [cursor=pointer]:
          - /url: /sales
          - img [ref=e65]
          - generic [ref=e68]: Sales
        - link "Stock Movements" [ref=e69] [cursor=pointer]:
          - /url: /stock-movements
          - img [ref=e70]
          - generic [ref=e73]: Stock Movements
        - link "Reports" [ref=e74] [cursor=pointer]:
          - /url: /reports
          - img [ref=e75]
          - generic [ref=e78]: Reports
        - link "AI Chat" [ref=e79] [cursor=pointer]:
          - /url: /ai-chat
          - img [ref=e80]
          - generic [ref=e83]: AI Chat
        - link "Settings" [ref=e84] [cursor=pointer]:
          - /url: /settings
          - img [ref=e85]
          - generic [ref=e88]: Settings
      - generic [ref=e89]:
        - button "Test Tenant A admin" [ref=e91] [cursor=pointer]:
          - img [ref=e93]
          - generic [ref=e97]:
            - paragraph [ref=e98]: Test Tenant A
            - paragraph [ref=e99]: admin
          - img [ref=e100]
        - generic [ref=e103]:
          - generic [ref=e104]: A
          - generic [ref=e105]:
            - paragraph [ref=e106]: Admin A
            - paragraph [ref=e107]: admin@tenant-a.com
        - button "Logout" [ref=e108] [cursor=pointer]:
          - img [ref=e109]
          - generic [ref=e112]: Logout
        - generic [ref=e113]:
          - paragraph [ref=e114]: System Status
          - generic [ref=e117]: All systems operational
    - main [ref=e118]:
      - generic [ref=e119]:
        - generic [ref=e121]:
          - generic [ref=e122]:
            - paragraph [ref=e123]: Tenant onboarding is incomplete
            - paragraph [ref=e124]: "Completion progress: 2/3 required checks."
          - button "Continue Setup" [ref=e125] [cursor=pointer]
        - generic [ref=e126]:
          - paragraph [ref=e127]: Add your phone number to complete your account profile.
          - paragraph [ref=e128]: New accounts require this during registration. Existing accounts can add it in Settings.
          - link "Add Phone Number" [ref=e130] [cursor=pointer]:
            - /url: /settings?tab=profile
        - generic [ref=e131]:
          - generic [ref=e132]:
            - heading "Sales Timeline" [level=1] [ref=e133]
            - paragraph [ref=e134]: Unified read-only sales view across POS and Dispatch transactions.
          - generic [ref=e135]:
            - generic [ref=e136]:
              - generic [ref=e137]:
                - button "All" [ref=e138] [cursor=pointer]
                - button "POS" [ref=e139] [cursor=pointer]
                - button "Dispatch" [ref=e140] [cursor=pointer]
                - combobox [ref=e141]:
                  - option "All Status" [selected]
                  - option "Completed"
                  - option "Voided"
                  - option "Draft"
                  - option "Confirmed"
                  - option "Partial"
                  - option "Dispatched"
                  - option "Cancelled"
                - combobox [ref=e142]:
                  - option "All Payments" [selected]
                  - option "Cash"
                  - option "GCash"
                  - option "Maya"
                  - option "Card"
                  - option "Bank Transfer"
                - combobox [ref=e143]:
                  - option "All Order Methods" [selected]
                  - option "Dine In"
                  - option "Takeout"
                  - option "Pickup"
                  - option "Delivery"
                - combobox [ref=e144]:
                  - option "All POS Channels" [selected]
                  - option "POS In-Store"
                  - option "POS Online Store"
                - combobox [ref=e145]:
                  - 'option "Sort: Date" [selected]'
                  - 'option "Sort: Gross"'
                  - 'option "Sort: COGS"'
                  - 'option "Sort: Profit"'
                  - 'option "Sort: Reference"'
                - combobox [ref=e146]:
                  - option "Desc" [selected]
                  - option "Asc"
                - textbox "Txn ID" [ref=e147]
                - textbox [ref=e148]
                - textbox [ref=e149]
                - button "Reset Filters" [ref=e150] [cursor=pointer]
              - generic [ref=e151]:
                - textbox "Search by invoice, DO number, recipient..." [ref=e152]
                - button "Export CSV" [ref=e153] [cursor=pointer]
            - generic [ref=e154]:
              - table "Unified sales transactions table" [ref=e156]:
                - caption [ref=e157]: Unified sales transactions with POS and dispatch sources
                - rowgroup [ref=e158]:
                  - row "Source Reference Date Party Gross COGS Profit Status Action" [ref=e159]:
                    - columnheader "Source" [ref=e160]
                    - columnheader "Reference" [ref=e161]
                    - columnheader "Date" [ref=e162]
                    - columnheader "Party" [ref=e163]
                    - columnheader "Gross" [ref=e164]
                    - columnheader "COGS" [ref=e165]
                    - columnheader "Profit" [ref=e166]
                    - columnheader "Status" [ref=e167]
                    - columnheader "Action" [ref=e168]
                - rowgroup [ref=e169]:
                  - row "No sales transactions found for current filters. Adjust date/source/search then retry export." [ref=e170]:
                    - cell "No sales transactions found for current filters. Adjust date/source/search then retry export." [ref=e171]
              - region "Selected transaction detail" [ref=e172]:
                - heading "Transaction Detail" [level=3] [ref=e173]
                - paragraph [ref=e174]: Select a sales row to inspect details.
            - generic [ref=e175]:
              - button "Previous" [disabled]
              - button "Next" [disabled]
    - generic [ref=e177]:
      - generic [ref=e178]:
        - heading "Tenant Onboarding Setup" [level=2] [ref=e179]
        - paragraph [ref=e180]: "Progress: 2/3 required. Mode: Food Manufacturing."
        - paragraph [ref=e181]: Step 1 of 3
        - navigation "Tenant onboarding setup steps" [ref=e182]:
          - generic [ref=e183]:
            - generic [ref=e184]:
              - 'button "Step 1: Brand Assets: Profile image, cover image, and optional branding setup." [ref=e185] [cursor=pointer]': "1"
              - 'tooltip "Brand Assets: Profile image, cover image, and optional branding setup."'
            - generic [ref=e187]:
              - 'button "Step 2: Storefront Location: Public visibility, main location, map pin, and business hours." [ref=e188] [cursor=pointer]': "2"
              - 'tooltip "Storefront Location: Public visibility, main location, map pin, and business hours."'
            - generic [ref=e190]:
              - 'button "Step 3: Menu Item: Create a priced menu item and optional Storefront item images." [ref=e191] [cursor=pointer]': "3"
              - 'tooltip "Menu Item: Create a priced menu item and optional Storefront item images."'
      - generic [ref=e193]:
        - heading "1) Profile and Cover" [level=3] [ref=e194]
        - generic [ref=e195]:
          - generic [ref=e196]:
            - generic [ref=e197]: Storefront cover preview
            - generic [ref=e199]: Profile
          - generic [ref=e200]:
            - paragraph [ref=e201]: Test Tenant A
            - paragraph [ref=e202]: Public storefront preview
        - generic [ref=e203]:
          - generic [ref=e204]:
            - text: Profile picture
            - button "Profile picture" [ref=e205]
          - generic [ref=e206]:
            - text: Cover photo
            - button "Cover photo" [ref=e207]
        - generic [ref=e208]:
          - button "Save and Continue" [ref=e209] [cursor=pointer]
          - button "Skip for Now" [ref=e210] [cursor=pointer]
      - generic [ref=e211]:
        - button "Previous" [disabled] [ref=e212]
        - button "Close (Soft Reminder)" [ref=e213] [cursor=pointer]
    - button "Send Feedback" [ref=e214] [cursor=pointer]:
      - img [ref=e215]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
  3  | import { TEST_COMPANY_TOKEN } from '../helpers/urls.js';
  4  | import { registerCrashDetection } from '../helpers/assertions.js';
  5  | 
  6  | test.describe('Skupervisor Navigation and Layout Integrity', () => {
  7  |   test.beforeEach(async ({ page }) => {
  8  |     await page.goto('/login');
  9  |     await loginToApp(page, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
  10 |     await page.waitForURL('**/');
  11 |   });
  12 | 
  13 |   test('Navigate to Items page', async ({ page }) => {
  14 |     const crashChecker = registerCrashDetection(page);
  15 |     await page.goto('/items');
  16 |     await crashChecker.assertNoCrashes();
  17 |     await expect(page.locator('h1:has-text("Items")').first()).toBeVisible();
  18 |     await expect(page.locator('body')).not.toBeEmpty();
  19 |   });
  20 | 
  21 |   test('Navigate to Settings page', async ({ page }) => {
  22 |     const crashChecker = registerCrashDetection(page);
  23 |     await page.goto('/settings');
  24 |     await crashChecker.assertNoCrashes();
  25 |     await expect(page.locator('h1:has-text("Settings")').first()).toBeVisible();
  26 |     await expect(page.locator('body')).not.toBeEmpty();
  27 |   });
  28 | 
  29 |   test('Navigate to Sales page', async ({ page }) => {
  30 |     const crashChecker = registerCrashDetection(page);
  31 |     await page.goto('/sales');
  32 |     await crashChecker.assertNoCrashes();
> 33 |     await expect(page.getByRole('heading', { name: /Sales/i }).or(page.locator('h1, h2'))).toBeVisible();
     |                                                                                            ^ Error: expect(locator).toBeVisible() failed
  34 |   });
  35 | 
  36 |   test('Navigate to Terminal Page', async ({ page }) => {
  37 |     const crashChecker = registerCrashDetection(page);
  38 |     await page.goto('/terminal');
  39 |     await crashChecker.assertNoCrashes();
  40 |     await expect(page.locator('body')).not.toBeEmpty();
  41 |   });
  42 | });
  43 | 
```
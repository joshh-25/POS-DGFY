# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: performance-flow.spec.js >> E2E Performance Audits >> Page navigation transition performance is fast
- Location: tests\e2e\performance-flow.spec.js:18:3

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 5000
Received:   11461
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications alt+T"
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e6]:
        - img "DGFY.PH" [ref=e7]
        - paragraph [ref=e8]: Business
      - navigation [ref=e9]:
        - link "Dashboard" [ref=e10] [cursor=pointer]:
          - /url: /
          - img [ref=e11]
          - generic [ref=e16]: Dashboard
        - link "Items" [ref=e17] [cursor=pointer]:
          - /url: /items
          - img [ref=e18]
          - generic [ref=e22]: Items
        - link "Suppliers" [ref=e23] [cursor=pointer]:
          - /url: /suppliers
          - img [ref=e24]
          - generic [ref=e29]: Suppliers
        - link "Purchase Orders" [ref=e30] [cursor=pointer]:
          - /url: /purchase-orders
          - img [ref=e31]
          - generic [ref=e34]: Purchase Orders
        - link "Job Orders" [ref=e35] [cursor=pointer]:
          - /url: /job-orders
          - img [ref=e36]
          - generic [ref=e38]: Job Orders
        - link "Dispatch Orders" [ref=e39] [cursor=pointer]:
          - /url: /dispatch-orders
          - img [ref=e40]
          - generic [ref=e45]: Dispatch Orders
        - link "POS Terminal" [ref=e46] [cursor=pointer]:
          - /url: /pos
          - img [ref=e47]
          - generic [ref=e51]: POS Terminal
        - link "Sales" [ref=e52] [cursor=pointer]:
          - /url: /sales
          - img [ref=e53]
          - generic [ref=e56]: Sales
        - link "Stock Movements" [ref=e57] [cursor=pointer]:
          - /url: /stock-movements
          - img [ref=e58]
          - generic [ref=e61]: Stock Movements
        - link "Reports" [ref=e62] [cursor=pointer]:
          - /url: /reports
          - img [ref=e63]
          - generic [ref=e66]: Reports
        - link "AI Chat" [ref=e67] [cursor=pointer]:
          - /url: /ai-chat
          - img [ref=e68]
          - generic [ref=e71]: AI Chat
        - link "Settings" [ref=e72] [cursor=pointer]:
          - /url: /settings
          - img [ref=e73]
          - generic [ref=e76]: Settings
      - generic [ref=e77]:
        - button "Current company member" [ref=e79] [cursor=pointer]:
          - img [ref=e81]
          - generic [ref=e85]:
            - paragraph [ref=e86]: Current company
            - paragraph [ref=e87]: member
          - img [ref=e88]
        - generic [ref=e91]:
          - generic [ref=e92]: A
          - generic [ref=e93]:
            - paragraph [ref=e94]: Admin A
            - paragraph [ref=e95]: admin@tenant-a.com
        - button "Logout" [ref=e96] [cursor=pointer]:
          - img [ref=e97]
          - generic [ref=e100]: Logout
        - generic [ref=e101]:
          - paragraph [ref=e102]: System Status
          - generic [ref=e105]: All systems operational
    - main [ref=e106]:
      - generic [ref=e107]:
        - generic [ref=e109]:
          - generic [ref=e110]:
            - paragraph [ref=e111]: Tenant onboarding is incomplete
            - paragraph [ref=e112]: "Completion progress: 2/3 required checks."
          - button "Continue Setup" [ref=e113] [cursor=pointer]
        - generic [ref=e114]:
          - paragraph [ref=e115]: Add your phone number to complete your account profile.
          - paragraph [ref=e116]: New accounts require this during registration. Existing accounts can add it in Settings.
          - link "Add Phone Number" [ref=e118] [cursor=pointer]:
            - /url: /settings?tab=profile
        - generic [ref=e119]:
          - generic [ref=e120]:
            - generic [ref=e121]:
              - heading "Inventory Items" [level=1] [ref=e122]
              - paragraph [ref=e123]: 0 items found
            - generic [ref=e124]:
              - button "Import / Export" [ref=e125] [cursor=pointer]:
                - img [ref=e126]
                - text: Import / Export
              - generic [ref=e129]:
                - button "Fix POS Setup (0)" [ref=e130] [cursor=pointer]:
                  - img [ref=e131]
                  - text: Fix POS Setup (0)
                - button "What Fix POS Setup checks" [ref=e134] [cursor=pointer]:
                  - img [ref=e135]
              - button "Add New Item" [ref=e137] [cursor=pointer]:
                - img [ref=e138]
                - text: Add New Item
          - generic [ref=e140]:
            - generic [ref=e141]:
              - generic [ref=e142]: Search
              - generic [ref=e143]:
                - img [ref=e144]
                - textbox "Search by name or SKU..." [ref=e147]
            - generic [ref=e148]:
              - generic [ref=e149]:
                - generic [ref=e150]: Category
                - button "all" [ref=e152] [cursor=pointer]:
                  - img [ref=e153]
                  - generic [ref=e155]: all
                  - img [ref=e156]
              - generic [ref=e158]:
                - generic [ref=e159]: Status
                - button "all" [ref=e161] [cursor=pointer]:
                  - generic [ref=e162]: all
                  - img [ref=e163]
              - generic [ref=e165]:
                - generic [ref=e166]: FIFO
                - button "all" [ref=e168] [cursor=pointer]:
                  - generic [ref=e169]: all
                  - img [ref=e170]
              - generic [ref=e172]:
                - generic [ref=e173]: Sort By
                - button "name" [ref=e175] [cursor=pointer]:
                  - generic [ref=e176]: name
                  - img [ref=e177]
              - generic [ref=e180]:
                - button [ref=e181] [cursor=pointer]:
                  - img [ref=e182]
                - button [ref=e187] [cursor=pointer]:
                  - img [ref=e188]
          - generic [ref=e190] [cursor=pointer]:
            - img [ref=e192]
            - generic [ref=e193]:
              - heading "Create Folder" [level=3] [ref=e194]
              - paragraph [ref=e195]: Organize your items
        - status [ref=e196]
    - generic [ref=e198]:
      - generic [ref=e199]:
        - heading "Tenant Onboarding Setup" [level=2] [ref=e200]
        - paragraph [ref=e201]: "Progress: 2/3 required. Mode: Food Manufacturing."
        - paragraph [ref=e202]: Step 1 of 3
        - navigation "Tenant onboarding setup steps" [ref=e203]:
          - generic [ref=e204]:
            - generic [ref=e205]:
              - 'button "Step 1: Brand Assets: Profile image, cover image, and optional branding setup." [ref=e206] [cursor=pointer]': "1"
              - 'tooltip "Brand Assets: Profile image, cover image, and optional branding setup."'
            - generic [ref=e208]:
              - 'button "Step 2: Storefront Location: Public visibility, main location, map pin, and business hours." [ref=e209] [cursor=pointer]': "2"
              - 'tooltip "Storefront Location: Public visibility, main location, map pin, and business hours."'
            - generic [ref=e211]:
              - 'button "Step 3: Menu Item: Create a priced menu item and optional Storefront item images." [ref=e212] [cursor=pointer]': "3"
              - 'tooltip "Menu Item: Create a priced menu item and optional Storefront item images."'
      - generic [ref=e214]:
        - heading "1) Profile and Cover" [level=3] [ref=e215]
        - generic [ref=e216]:
          - generic [ref=e217]:
            - generic [ref=e218]: Storefront cover preview
            - generic [ref=e220]: Profile
          - generic [ref=e221]:
            - paragraph [ref=e222]: Test Tenant A
            - paragraph [ref=e223]: Public storefront preview
        - generic [ref=e224]:
          - generic [ref=e225]:
            - text: Profile picture
            - button "Profile picture" [ref=e226]
          - generic [ref=e227]:
            - text: Cover photo
            - button "Cover photo" [ref=e228]
        - generic [ref=e229]:
          - button "Save and Continue" [ref=e230] [cursor=pointer]
          - button "Skip for Now" [ref=e231] [cursor=pointer]
      - generic [ref=e232]:
        - button "Previous" [disabled] [ref=e233]
        - button "Close (Soft Reminder)" [ref=e234] [cursor=pointer]
    - button "Send Feedback" [ref=e235] [cursor=pointer]:
      - img [ref=e236]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('E2E Performance Audits', () => {
  4  |   test('Login page loads and registers timing successfully', async ({ page }) => {
  5  |     const startTime = Date.now();
  6  |     await page.goto('/login');
  7  |     
  8  |     // Wait for the Sign In button to be actionable
  9  |     await page.getByRole('button', { name: /Sign In/i }).waitFor({ state: 'attached' });
  10 |     
  11 |     const loadTime = Date.now() - startTime;
  12 |     console.log(`⏱️ Login page E2E load time: ${loadTime}ms`);
  13 |     
  14 |     // Threshold validation: Should load within 3 seconds
  15 |     expect(loadTime).toBeLessThan(3000);
  16 |   });
  17 | 
  18 |   test('Page navigation transition performance is fast', async ({ page }) => {
  19 |     // Authenticate
  20 |     const email = process.env.VITE_TEST_USER_EMAIL || 'admin@tenant-a.com';
  21 |     const password = process.env.VITE_TEST_USER_PASSWORD || 'Admin123!';
  22 |     
  23 |     await page.goto('/login');
  24 |     
  25 |     // Set up lookup request promise before triggering blur
  26 |     const lookupPromise = page.waitForResponse(
  27 |       res => res.url().includes('/auth/lookup'),
  28 |       { timeout: 5000 }
  29 |     ).catch(() => null);
  30 |     
  31 |     await page.locator('input[type="email"]').fill(email);
  32 |     await page.locator('input[type="password"]').fill(password);
  33 |     await page.locator('input[type="email"]').blur();
  34 |     
  35 |     await lookupPromise; // Wait for async API company token lookup
  36 |     
  37 |     const tokenInput = page.locator('input[id="companyToken"]');
  38 |     if (await tokenInput.isVisible()) {
  39 |       await tokenInput.fill('token-tenant-a');
  40 |     }
  41 |     
  42 |     await page.getByRole('button', { name: /Sign In/i }).click();
  43 |     await page.waitForURL('**/');
  44 | 
  45 |     // Time transition to items page
  46 |     const startTime = Date.now();
  47 |     await page.goto('/items');
  48 |     await page.locator('h1, h2').first().waitFor();
  49 |     const transitionTime = Date.now() - startTime;
  50 |     console.log(`⏱️ Navigation transition time to /items: ${transitionTime}ms`);
  51 |     
  52 |     // Threshold validation: Should load within 5 seconds for cold-start local DB connection pools
> 53 |     expect(transitionTime).toBeLessThan(5000);
     |                            ^ Error: expect(received).toBeLessThan(expected)
  54 |   });
  55 | });
  56 | 
```
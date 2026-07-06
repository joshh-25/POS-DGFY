# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos\smoke.spec.js >> POS Smoke & Crash Regression Tests >> POS loads and has no runtime crashes
- Location: tests\e2e\pos\smoke.spec.js:7:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/login" until "load"
  navigated to "http://127.0.0.1:5174/pos"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications alt+T"
  - generic [ref=e3]:
    - generic:
      - complementary:
        - generic:
          - generic:
            - generic:
              - img "DGFY"
          - generic:
            - paragraph: Primary Modes
            - generic:
              - button "Sell Unlock terminal to continue" [disabled]:
                - img
                - generic:
                  - generic: Sell
                  - paragraph: Unlock terminal to continue
              - button "History Unlock terminal to continue" [disabled]:
                - img
                - generic:
                  - generic: History
                  - paragraph: Unlock terminal to continue
              - button "Report Unlock terminal to continue" [disabled]:
                - img
                - generic:
                  - generic: Report
                  - paragraph: Unlock terminal to continue
              - button "Items Unlock terminal to continue" [disabled]:
                - img
                - generic:
                  - generic: Items
                  - paragraph: Unlock terminal to continue
              - button "Orders (0) Unlock terminal to continue" [disabled]:
                - img
                - generic:
                  - generic: Orders (0)
                  - paragraph: Unlock terminal to continue
              - button "Shift Unlock terminal to continue" [disabled]:
                - img
                - generic:
                  - generic: Shift
                  - paragraph: Unlock terminal to continue
            - paragraph: Settings
            - generic:
              - button "Settings Unlock terminal to continue" [disabled]:
                - img
                - generic:
                  - generic: Settings
                  - paragraph: Unlock terminal to continue
            - generic:
              - button "Unlock Terminal":
                - img
                - text: Unlock Terminal
    - main [ref=e4]:
      - generic:
        - generic:
          - generic:
            - generic:
              - button "Hide sidebar" [disabled]:
                - img
              - generic:
                - heading "POS Catalog" [level=1]
                - paragraph: Terminal locked (COUNTER-01) [Food Manufacturing]. Sign in from the right panel.
          - generic:
            - generic:
              - button "Open notifications":
                - img
            - generic:
              - generic:
                - img
              - generic:
                - generic: Locked
                - generic: Sign in required
      - generic:
        - generic:
          - generic:
            - generic:
              - generic:
                - generic:
                  - generic:
                    - region "POS catalog contents":
                      - generic:
                        - generic:
                          - generic:
                            - img
                            - generic: Search POS-visible items
                            - textbox "Search POS-visible items Backspace search":
                              - /placeholder: Search POS-visible items...
                            - button "Backspace search" [disabled]:
                              - img
                          - button "Filter":
                            - img
                            - text: Filter
                            - img
                          - generic:
                            - button "Scan" [disabled]:
                              - img
                              - text: Scan
                      - generic:
                        - paragraph: Loading catalog...
                    - generic:
                      - generic:
                        - generic:
                          - paragraph: Catalog Footer
                          - paragraph: Showing 0-0 of 0 items
                        - generic:
                          - button "Go to previous catalog page" [disabled]:
                            - img
                            - text: Previous
                          - generic: Page 1 of 1
                          - button "Go to next catalog page" [disabled]:
                            - text: Next
                            - img
                  - complementary [ref=e5]:
                    - region "Current sale contents" [ref=e7]:
                      - generic [ref=e9]:
                        - heading "Current Sale" [level=2] [ref=e10]
                        - button "Toggle current sale help" [ref=e12] [cursor=pointer]:
                          - img [ref=e13]
                      - generic [ref=e15]:
                        - generic [ref=e16]:
                          - generic [ref=e17]:
                            - generic [ref=e18]:
                              - text: Order Method
                              - combobox "Order Method" [ref=e19]:
                                - option "Dine In" [selected]
                                - option "Takeout"
                                - option "Pickup"
                                - option "Delivery"
                                - option "Appointment"
                            - generic [ref=e20]:
                              - text: Payment Type
                              - combobox "Payment Type" [ref=e21]:
                                - option "Cash" [selected]
                                - option "GCash"
                                - option "Maya"
                                - option "Card"
                                - option "Bank Transfer"
                          - generic [ref=e24]:
                            - generic [ref=e25]:
                              - paragraph [ref=e26]: Current Sale
                              - generic [ref=e27]: Empty
                            - generic [ref=e29]: No items in cart yet.
                            - paragraph [ref=e30]: Add items to start this sale.
                        - generic [ref=e33]:
                          - paragraph [ref=e34]: Discount
                          - paragraph [ref=e35]: No discount applied
                        - generic [ref=e36]:
                          - generic [ref=e37]:
                            - generic [ref=e38]: Items Subtotal
                            - generic [ref=e39]: PHP 0.00
                          - generic [ref=e40]:
                            - generic [ref=e41]: Discount
                            - generic [ref=e42]: "- PHP 0.00"
                          - generic [ref=e43]:
                            - generic [ref=e44]: Net Items
                            - generic [ref=e45]: PHP 0.00
                          - generic [ref=e46]:
                            - generic [ref=e47]: DGFY convenience fee (1%)
                            - generic [ref=e48]: + PHP 0.00
                          - generic [ref=e50]:
                            - generic [ref=e51]: Vatable Sales
                            - generic [ref=e52]: PHP 0.00
                          - generic [ref=e53]:
                            - generic [ref=e54]: VAT Amount
                            - generic [ref=e55]: PHP 0.00
                          - generic [ref=e56]:
                            - generic [ref=e57]: VAT Exempt Sales
                            - generic [ref=e58]: PHP 0.00
                          - generic [ref=e59]:
                            - generic [ref=e60]: Zero Rated Sales
                            - generic [ref=e61]: PHP 0.00
                          - generic [ref=e62]:
                            - generic [ref=e63]: Total
                            - generic [ref=e64]: PHP 0.00
                      - generic [ref=e66]: Terminal locked. Login from the right panel.
                      - generic [ref=e67]:
                        - button "Print Order" [disabled]:
                          - img
                          - text: Print Order
                        - button "Checkout" [disabled]:
                          - img
                          - text: Checkout
                        - button "Close Day / Z-Reading" [ref=e68] [cursor=pointer]:
                          - img [ref=e69]
                          - text: Close Day / Z-Reading
                        - button "Print Last Receipt" [disabled]:
                          - img
                          - text: Print Last Receipt
                        - button "Open Cash Drawer" [disabled]
                        - button "Apply Discount" [disabled]
      - generic [ref=e73]:
        - generic [ref=e75]:
          - img [ref=e77]
          - heading "Terminal Login Required" [level=2] [ref=e81]
        - generic [ref=e82]:
          - generic [ref=e83]:
            - generic [ref=e85]: DGFY Email
            - textbox "DGFY Email" [ref=e86]:
              - /placeholder: admin@company.com
          - generic [ref=e87]:
            - text: DGFY Password
            - textbox "DGFY Password" [ref=e88]:
              - /placeholder: Enter your password
          - generic [ref=e89]: Sign in with your DGFY account first. Company selection and terminal unlock appear after login succeeds.
          - button "Sign in" [ref=e90] [cursor=pointer]
        - group [ref=e92]:
          - generic "Legacy access until June 17, 2027" [ref=e93] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { loginToApp, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../helpers/auth.js';
  3  | import { TEST_COMPANY_TOKEN } from '../helpers/urls.js';
  4  | import { registerCrashDetection } from '../helpers/assertions.js';
  5  | 
  6  | test.describe('POS Smoke & Crash Regression Tests', () => {
  7  |   test('POS loads and has no runtime crashes', async ({ page }) => {
  8  |     const crashChecker = registerCrashDetection(page);
  9  |     
  10 |     // Redirects to login when unauthenticated
  11 |     await page.goto('/pos');
> 12 |     await page.waitForURL('**/login');
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  13 |     await crashChecker.assertNoCrashes();
  14 | 
  15 |     // Authenticate
  16 |     await loginToApp(page, TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_COMPANY_TOKEN);
  17 |     await page.waitForURL('**/');
  18 |     
  19 |     // Navigate to POS terminal
  20 |     await page.goto('/pos');
  21 |     await page.waitForTimeout(1000); // Allow catalog to fetch and mount
  22 |     
  23 |     // Verify no React boundaries or ReferenceErrors exist
  24 |     await crashChecker.assertNoCrashes();
  25 |     await expect(page.locator('body')).not.toBeEmpty();
  26 |   });
  27 | });
  28 | 
```
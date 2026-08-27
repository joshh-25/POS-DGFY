#!/usr/bin/env node
// #622 (PR #1095, reviewer finding RF-3): Architecture Governance item 8 rendered-UI proof for the
// storefront's guest-vs-account checkout entry gate (renderGuestCheckoutEntry in
// apps/dgfy-storefront/src/features/checkout/renderers/customerIdentityRenderers.jsx). Modelled on
// the two existing committed rendered-QA harnesses (scripts/smoke-dgfy-access-ui.js,
// scripts/smoke-pos-terminal-ui.js) -- same playwright import, viewport list shape, console/
// response-failure collection, and .tmp/rendered-qa/<suite>/ artifact convention.
//
// Two real local-test tenants exercise both toggle states with zero data mutation for the enabled
// case (a missing storefront_guest_checkout_enabled row resolves to enabled everywhere it's read):
//   - pat-marketing-314108 (retail): no row -> enabled. Proves "Continue as Guest" is offered.
//   - pat-s-non-existent-kainan-6086e7 (fnb): storefront_guest_checkout_enabled='false' already set
//     -> disabled. Proves "Continue as Guest" is withheld and the copy switches to account-required.
// Both tenants have customer_access_mode=transaction, 24/7-or-currently-open hours, and real
// sellable products, so /tenant-store/<slug>/order renders the gate directly -- no cart needed,
// since the cart-drawer "Order & Purchase" button is only the in-UI path to that route, not a
// precondition the route itself enforces.
const fs = require('fs/promises');
const path = require('path');
const playwright = require('../apps/dgfy-api/node_modules/playwright');

const baseUrl = String(process.env.STOREFRONT_UI_BASE_URL || 'http://localhost:5175').replace(/\/+$/, '');

const viewports = [
  { name: 'desktop', width: 1440, height: 960, isMobile: false },
  // 390px is comfortably below the storefront's own mobile breakpoint
  // (viewportWidth < 840, apps/dgfy-storefront/src/StorefrontApp.jsx:448), so this genuinely
  // exercises the mobile-layout branch rather than just a narrower desktop render.
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

const artifactRoot = path.resolve(process.cwd(), '.tmp', 'rendered-qa', 'guest-checkout-gate');
const evidencePath = path.join(artifactRoot, 'guest-checkout-gate-ui-smoke.json');

const checks = [
  {
    key: 'enabled',
    label: 'guest checkout enabled (pat-marketing-314108, retail, no settings row)',
    url: `${baseUrl}/tenant-store/pat-marketing-314108/order`,
    expectPageIdentity: /Continue to your order/i,
    expectContent: /Create an account or continue as guest/i,
    expectAbsent: null,
    requiredButtons: [/Create DGFY Account/i, /Continue as Guest/i, /Log in/i],
    // Primary interaction: unlock the guest path in-page (setGuestCheckoutUnlocked(true) --
    // no navigation) and assert the gate is replaced by the actual guest details step. This is
    // the interaction that only exists because the toggle is enabled -- the negative proof for
    // the disabled tenant below is that this same button never appears at all.
    interact: async (page) => {
      await page.getByRole('button', { name: /Continue as Guest/i }).click();
      await page.waitForTimeout(300);
      const bodyText = await page.locator('body').innerText({ timeout: 10000 });
      const advancedToGuestDetails = /Guest Details|Step 1: Customer Details/i.test(bodyText);
      // RF-5: the harness's claimed proof is the transition, not merely "the click didn't throw" --
      // a click that lands but goes nowhere (wrong selector, dead handler, stale route) must fail
      // the run, not print PASS. `passed` is the single boolean the failure reducer checks below.
      return {
        interaction: 'clicked "Continue as Guest"',
        advancedToGuestDetails,
        passed: advancedToGuestDetails === true
      };
    }
  },
  {
    key: 'disabled',
    label: "guest checkout disabled (pat-s-non-existent-kainan-6086e7, fnb, storefront_guest_checkout_enabled='false')",
    url: `${baseUrl}/tenant-store/pat-s-non-existent-kainan-6086e7/order`,
    expectPageIdentity: /Continue to your order/i,
    expectContent: /This store requires a DGFY account to check out/i,
    expectAbsent: /Continue as Guest/i,
    requiredButtons: [/Create DGFY Account/i, /Log in/i],
    // Primary interaction: click "Create DGFY Account" -- an in-app SPA route change to /login
    // or /register (apps/dgfy-storefront/src/main.jsx's own <Route>), not an external redirect
    // (openCanonicalDgfyAuth navigates in-app; see useCustomerAuthNavigation.js). Asserts real
    // page identity + nonblank content on the destination, proving the button is wired, not dead.
    interact: async (page) => {
      await page.getByRole('button', { name: /Create DGFY Account/i }).click();
      await page.waitForTimeout(300);
      const url = page.url();
      const bodyText = await page.locator('body').innerText({ timeout: 10000 });
      const navigatedToAuth = /\/register|\/login/.test(url);
      const authPageNonblank = bodyText.trim().length > 0;
      // RF-5: both legs of the proof -- landed on the right route AND that route actually rendered
      // something -- are required, not just "no exception was thrown."
      return {
        interaction: 'clicked "Create DGFY Account"',
        navigatedToAuth,
        landedUrl: url,
        authPageNonblank,
        passed: navigatedToAuth === true && authPageNonblank === true
      };
    }
  }
];

// RF-5: a tenant's storefront profile/cover image 403s in this local-test env (confirmed via direct
// network inspection to be /uploads/storefront-assets/<tenant>/profile-.../large.webp -- an
// unrelated static-asset access-control quirk, nothing to do with the guest-checkout gate this
// suite proves). Filtering used to match on the console log's bare status text, which had no URL
// attached and so silently swallowed *every* 403, including one that would actually matter to this
// flow. Filtering now happens at the response level instead, scoped to this exact documented URL
// shape, so an unrelated/unexpected 4xx on the target flow still fails the run.
const KNOWN_BENIGN_RESPONSE = {
  status: 403,
  urlPattern: /\/uploads\/storefront-assets\/.*\.(webp|png|jpe?g)(\?.*)?$/i
};

const normalizeErrors = (errors) => errors.filter((entry) => {
  const text = `${entry.type || ''} ${entry.text || ''}`;
  if (/React Router Future Flag Warning/i.test(text)) return false;
  // "Failed to load resource" console lines duplicate what the response-level listener already
  // captures with a URL attached, and provide no way to scope a filter safely -- drop them from
  // console-error evidence entirely; HTTP failures are judged from responseFailures instead.
  if (/Failed to load resource: the server responded with a status of \d+/i.test(text)) return false;
  return true;
});

const runCheck = async (browser, check, viewport) => {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile
  });
  const consoleEntries = [];
  const responseFailures = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleEntries.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    consoleEntries.push({ type: 'pageerror', text: error.message });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    const isKnownBenign = status === KNOWN_BENIGN_RESPONSE.status && KNOWN_BENIGN_RESPONSE.urlPattern.test(url);
    if (isKnownBenign) return;
    // RF-5: fail on any 5xx outright, and on a 4xx against this flow's own API surface (the
    // storefront's store/catalog/checkout/auth endpoints) -- an unexpected 401/403/404 there is
    // exactly the class of bug this suite exists to catch. A 4xx against something unrelated
    // (third-party beacon, unrelated asset) is recorded but doesn't fail the run, same convention
    // already used by scripts/smoke-dgfy-access-ui.js.
    const relevantToFlow = /\/api\/v1\/store\//i.test(url);
    responseFailures.push({
      status,
      url,
      method: response.request().method(),
      relevant: status >= 500 || relevantToFlow
    });
  });

  // Registered before navigation so a catalog response that lands during/just after
  // domcontentloaded is still caught (a post-hoc waitForResponse call can miss an already-fired
  // event and wait the full timeout for nothing -- confirmed the slow way).
  const catalogResponse = page.waitForResponse((response) => response.url().includes('/api/v1/store/catalog'), { timeout: 20000 }).catch(() => null);
  await page.goto(check.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Two waits, not one -- both load-bearing, confirmed by reproducing each failure mode directly:
  //   1. The gate's own page-identity text: a fixed sleep was flaky on the very first navigation
  //      to a given tenant slug (a cold catalog/discovery fetch can take longer than a fixed
  //      750ms).
  //   2. The catalog response that carries access_policy.guest_checkout_enabled: the storefront
  //      deliberately fails open while that fetch is in flight (client fails open, server fails
  //      closed -- the asymmetry this feature is built on), so the gate's very first paint always
  //      shows "Continue as Guest" regardless of the setting, then re-renders once the response
  //      lands. Reading the DOM right after step 1 alone caught that transient, not the settled
  //      state -- confirmed by direct reproduction (getByText().waitFor() alone read `true` for a
  //      tenant where the API had already returned `guest_checkout_enabled: false`).
  await page.getByText(check.expectPageIdentity).first().waitFor({ timeout: 20000 }).catch(() => {});
  await catalogResponse;
  await page.waitForTimeout(300);
  const title = await page.title();
  const bodyText = await page.locator('body').innerText({ timeout: 10000 });

  const buttonResults = [];
  for (const pattern of check.requiredButtons) {
    const count = await page.getByRole('button', { name: pattern }).count().catch(() => 0);
    buttonResults.push({ pattern: String(pattern), found: count > 0 });
  }
  const absentButtonFound = check.expectAbsent
    ? (await page.getByRole('button', { name: check.expectAbsent }).count().catch(() => 0)) > 0
    : false;

  const screenshotPath = path.join(artifactRoot, `${check.key}-${viewport.name}.png`);
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const interactionResult = await check.interact(page).catch((error) => ({ interactionError: error.message }));

  const frameworkOverlay = /vite|webpack|react error|syntaxerror|referenceerror/i.test(bodyText)
    && /stack|plugin|module|compiled/i.test(bodyText);
  const errors = normalizeErrors(consoleEntries);
  await page.close();

  return {
    check: check.key,
    label: check.label,
    viewport: viewport.name,
    url: check.url,
    title,
    nonblank: bodyText.trim().length > 0,
    pageIdentityMatched: check.expectPageIdentity.test(bodyText),
    contentMatched: check.expectContent.test(bodyText),
    absentButtonCorrectlyMissing: check.expectAbsent ? !absentButtonFound : true,
    buttons: buttonResults,
    frameworkOverlay,
    consoleErrors: errors,
    responseFailures,
    interactionResult,
    screenshotPath
  };
};

const run = async () => {
  const launchOptions = { headless: true };
  // Some local dev machines have a Playwright-managed Chromium build installed under a different
  // cache key than the one apps/dgfy-api's own playwright version expects (headless_shell missing
  // while a full chrome-for-testing build exists) -- allow pointing at it explicitly rather than
  // requiring a fresh `npx playwright install` download, mirroring how CI would set this if it
  // ever needed to. No-op when unset; Playwright resolves its own default as usual.
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const browser = await playwright.chromium.launch(launchOptions);
  const evidence = [];
  try {
    for (const check of checks) {
      for (const viewport of viewports) {
        evidence.push(await runCheck(browser, check, viewport));
      }
    }
  } finally {
    await browser.close();
  }

  const failures = evidence.flatMap((entry) => {
    const failed = [];
    if (!entry.nonblank) failed.push(`${entry.check}.${entry.viewport}.blank`);
    if (!entry.pageIdentityMatched) failed.push(`${entry.check}.${entry.viewport}.pageIdentity`);
    if (!entry.contentMatched) failed.push(`${entry.check}.${entry.viewport}.content`);
    if (!entry.absentButtonCorrectlyMissing) failed.push(`${entry.check}.${entry.viewport}.guestButtonShouldBeAbsent`);
    for (const button of entry.buttons) {
      if (!button.found) failed.push(`${entry.check}.${entry.viewport}.missingButton=${button.pattern}`);
    }
    if (entry.frameworkOverlay) failed.push(`${entry.check}.${entry.viewport}.frameworkOverlay`);
    if (entry.consoleErrors.length > 0) {
      failed.push(`${entry.check}.${entry.viewport}.consoleErrors=${entry.consoleErrors.map((e) => e.text).join(' | ')}`);
    }
    const relevantResponseFailures = entry.responseFailures.filter((f) => f.relevant);
    if (relevantResponseFailures.length > 0) {
      failed.push(`${entry.check}.${entry.viewport}.network=${relevantResponseFailures.map((f) => `${f.status} ${f.method} ${f.url}`).join(' | ')}`);
    }
    // RF-5: the primary-interaction proof is only real if `passed` is explicitly true -- a click
    // that throws, does nothing, lands on the wrong route, or renders a blank destination must all
    // fail the run rather than only the (rare) thrown-exception case.
    if (entry.interactionResult?.passed !== true) {
      const reason = entry.interactionResult?.interactionError
        ? `threw: ${entry.interactionResult.interactionError}`
        : JSON.stringify(entry.interactionResult);
      failed.push(`${entry.check}.${entry.viewport}.interactionFailed=${reason}`);
    }
    return failed;
  });

  console.log('[guest-checkout-gate-ui-smoke] evidence');
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    artifactRoot,
    evidence
  };
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(evidencePath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  if (failures.length > 0) {
    console.error(`[guest-checkout-gate-ui-smoke] FAIL ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('[guest-checkout-gate-ui-smoke] PASS');
};

run().catch((error) => {
  console.error('[guest-checkout-gate-ui-smoke] failed:', error);
  process.exit(1);
});

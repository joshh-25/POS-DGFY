import { expect, test } from '@playwright/test';
import { registerCrashDetection } from './helpers/assertions.js';

const account = {
  id: 'release-account-1',
  first_name: 'Release',
  last_name: 'Reviewer',
  email: 'release-reviewer@example.test',
  phone: '+639123456789'
};

const legalTerms = {
  flows: {
    company_registration: {
      snapshot: {
        company_terms_version: 'company-terms-release-2026-09',
        marketplace_terms_version: 'marketplace-terms-release-2026-09',
        acknowledgement_text: 'I agree to the current DGFY registration terms.'
      },
      documents: []
    }
  }
};

const makeDraft = (overrides = {}) => ({
  id: 'release-draft-1',
  status: 'draft',
  current_step: 1,
  version: 1,
  payload: {
    business: {},
    storefront: { social_links: {}, delivery_partners: [], gallery: [] },
    location: {},
    hours: { monday: { open: '09:00', close: '17:00' } },
    menu: { upload_ids: [] }
  },
  uploads: [],
  ...overrides
});

const fulfillJson = (route, data) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ success: true, data })
});

async function mockRegistrationApi(page) {
  const state = { draft: makeDraft(), patchCount: 0 };

  await page.route('**/api/v1/dgfy/auth/me', (route) => fulfillJson(route, {
    token: 'release-token',
    account
  }));
  await page.route('**/api/v1/dgfy/legal-terms/current', (route) => fulfillJson(route, legalTerms));
  await page.route('**/api/v1/registration/industries**', (route) => fulfillJson(route, {
    industries: [{
      key: 'micro_fnb',
      label: 'Micro Food & Beverage',
      summary: 'Food and beverage businesses',
      niches: ['Cafe'],
      hidden: false
    }]
  }));
  await page.route('**/api/v1/registration/drafts', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(route, state.draft);
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/registration/drafts/release-draft-1', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      state.patchCount += 1;
      state.draft = makeDraft({
        current_step: Number(body.current_step || 1),
        version: Number(body.version || 1) + 1,
        payload: body.payload || state.draft.payload
      });
      await fulfillJson(route, state.draft);
      return;
    }
    await route.continue();
  });

  return state;
}

const assertNoHorizontalOverflow = async (page) => {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
};

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test(`registration moves through the first two steps without runtime or layout failures on ${viewport.name} @registration @release`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const crashChecker = registerCrashDetection(page, {
      failOnConsoleErrors: true,
      failOnClientErrors: true,
      failOnRequestFailures: true,
      failOnServerErrors: true
    });
    const state = await mockRegistrationApi(page);

    await page.goto('/business/grow', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Business details', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Business registration steps' })).toBeVisible();
    await expect(page.getByRole('button', { name: /step 1 business details/i })).toHaveAttribute('aria-current', 'step');
    await assertNoHorizontalOverflow(page);
    await crashChecker.assertNoCrashes('registration step 1');

    await page.getByLabel('Business type', { exact: true }).selectOption('food_beverage');
    await page.getByLabel('Company name').fill('Release Verification Cafe');
    await page.getByLabel('What kind of business is this?').selectOption('micro_fnb');
    await page.getByRole('button', { name: /save and continue/i }).click();

    await expect(page.getByRole('heading', { name: 'Storefront profile', exact: true })).toBeVisible();
    await expect.poll(() => state.patchCount).toBe(1);
    await expect(page.getByRole('button', { name: /step 2 storefront profile/i })).toHaveAttribute('aria-current', 'step');
    await assertNoHorizontalOverflow(page);
    await crashChecker.assertNoCrashes('registration step 2');

    await page.getByRole('button', { name: /step 1 business details/i }).click();
    await expect(page.getByRole('heading', { name: 'Business details', exact: true })).toBeVisible();
    await expect(page.getByLabel('Company name')).toHaveValue('Release Verification Cafe');
    await crashChecker.assertNoCrashes('registration resume step 1');
  });
}

test('submission confirmation remains accessible and responsive on mobile @registration @release', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const crashChecker = registerCrashDetection(page, {
    failOnConsoleErrors: true,
    failOnClientErrors: true,
    failOnRequestFailures: true,
    failOnServerErrors: true
  });

  await page.goto('/business-registration-submission?application_id=release-application-1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Registration submitted!', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /view registration status/i })).toHaveAttribute('href', '/business-registration-submission?application_id=release-application-1');
  await expect(page.getByRole('link', { name: /go to customer dashboard/i })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await crashChecker.assertNoCrashes('registration submission confirmation');
});

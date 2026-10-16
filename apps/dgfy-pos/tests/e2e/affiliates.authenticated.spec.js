import { test, expect } from '@playwright/test';
import { hasTestCredentials } from './fixtures/test-credentials.js';

const AFFILIATE_PREVIEW_URL = '/?view=settings_affiliates&affiliate_preview=1#/terminal';

async function openAffiliatePreview(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(AFFILIATE_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Affiliates List', exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Affiliates list', exact: true })).toBeVisible();
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    body: { client: document.body.clientWidth, scroll: document.body.scrollWidth },
    document: { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }
  }));

  expect(dimensions.body.scroll).toBeLessThanOrEqual(dimensions.body.client + 1);
  expect(dimensions.document.scroll).toBeLessThanOrEqual(dimensions.document.client + 1);
}

test.beforeEach(async () => {
  test.skip(!hasTestCredentials, 'Provide E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD in .env.e2e.');
});

test('Affiliate route loads its live read surface without mutation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const failedAffiliateResponses = [];
  page.on('response', (response) => {
    if (/\/api\/v1\/dgfy\/affiliates\//i.test(response.url()) && response.status() >= 400) {
      failedAffiliateResponses.push(`${response.status()}: ${response.url()}`);
    }
  });

  await page.goto('/?view=settings_affiliates#/terminal', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Affiliates List', exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Affiliates list', exact: true })).toBeVisible();
  await expect(page.getByTestId('affiliate-list-pagination')).toBeVisible();
  expect(failedAffiliateResponses, failedAffiliateResponses.join('\n')).toEqual([]);
});

test('Affiliate preview renders list, invite, settings, and action surfaces without mutation', async ({ page }) => {
  await openAffiliatePreview(page, { width: 1440, height: 900 });

  await expect(page.getByTestId('affiliate-table-region')).toBeVisible();
  await expect(page.getByTestId('affiliate-list-pagination')).toBeVisible();
  await expect(page.getByTestId('affiliate-pending-invites-heading')).toBeVisible();
  await expect(page.getByTestId('affiliate-pending-invites-pagination')).toBeVisible();

  await page.getByRole('button', { name: 'Invite Affiliate', exact: true }).click();
  await expect(page.getByTestId('affiliate-invite-dialog')).toBeVisible();
  await expect(page.getByLabel('Email to invite', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('affiliate-invite-dialog')).toBeHidden();

  await page.locator('button[aria-label^="Actions for "]').first().click();
  await expect(page.getByTestId('affiliate-actions-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close affiliate actions dialog', exact: true }).click();
  await expect(page.getByTestId('affiliate-actions-dialog')).toBeHidden();

  const cashoutTab = page.getByRole('tab', { name: 'Cashout', exact: true });
  if (await cashoutTab.isEnabled().catch(() => false)) {
    await cashoutTab.click();
    await expect(page.getByRole('tabpanel', { name: 'Affiliate cashout', exact: true })).toBeVisible();
    await expect(page.getByTestId('affiliate-cashout-table-region')).toBeVisible();
    await expect(page.getByTestId('affiliate-cashout-pagination')).toBeVisible();

    const cashoutAction = page.locator('button[aria-label^="Actions for "]').first();
    if (await cashoutAction.count()) {
      await cashoutAction.click();
      await expect(page.getByTestId('affiliate-cashout-actions-dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Close cashout actions dialog', exact: true }).click();
      await expect(page.getByTestId('affiliate-cashout-actions-dialog')).toBeHidden();
    }
  }

  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Affiliate settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Program Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Selling Price', exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('Affiliate preview remains readable on mobile without horizontal overflow', async ({ page }) => {
  await openAffiliatePreview(page, { width: 390, height: 844 });

  await expect(page.getByTestId('affiliate-mobile-records')).toBeVisible();
  await expect(page.getByTestId('affiliate-list-pagination')).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.locator('button[aria-label^="Actions for "]').first().click();
  await expect(page.getByTestId('affiliate-actions-dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close affiliate actions dialog', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close affiliate actions dialog', exact: true }).click();
  await expect(page.getByTestId('affiliate-actions-dialog')).toBeHidden();
  await assertNoHorizontalOverflow(page);
});

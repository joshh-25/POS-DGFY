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
  await page.route('**/api/v1/geo/address-search**', (route) => fulfillJson(route, {
    results: [{
      address_line: 'Jaro Plaza, Iloilo City',
      latitude: 10.725,
      longitude: 122.56,
      precision: 'street',
      provider: 'release-test'
    }]
  }));
  await page.route('**/api/v1/geo/reverse-geocode**', (route) => fulfillJson(route, {
    address_line: 'Jaro Plaza, Iloilo City',
    precision: 'street',
    provider: 'release-test'
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

const assertMinimumTouchTarget = async (locator, minimum = 44) => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(minimum);
  expect(box.height).toBeGreaterThanOrEqual(minimum);
};

const activateControl = async (locator, { preferTouch = true } = {}) => {
  if (preferTouch && test.info().project.use?.hasTouch) {
    await locator.tap({ force: true });
    return;
  }
  await locator.click();
};

const assertPlaceholderFits = async (field) => {
  const metrics = await field.evaluate((input) => {
    const style = window.getComputedStyle(input);
    const placeholderStyle = window.getComputedStyle(input, '::placeholder');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${placeholderStyle.fontWeight} ${placeholderStyle.fontSize} ${placeholderStyle.fontFamily}`;

    return {
      textWidth: context.measureText(input.placeholder).width,
      contentWidth: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    };
  });

  expect(metrics.textWidth).toBeLessThanOrEqual(metrics.contentWidth);
};

const scrollActiveRegistrationStepToBottom = async (page) => {
  await page.evaluate(() => {
    const region = document.querySelector('[role="region"][aria-labelledby="registration-step-heading"]');
    const pageScroller = document.scrollingElement;
    if (region && region.scrollHeight > region.clientHeight) region.scrollTop = region.scrollHeight;
    if (pageScroller && pageScroller.scrollHeight > window.innerHeight) pageScroller.scrollTop = pageScroller.scrollHeight;
  });
};

const expectRegistrationStepAtTop = async (page, title) => {
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const region = document.querySelector('[role="region"][aria-labelledby="registration-step-heading"]');
    const heading = document.getElementById('registration-step-heading');
    return Boolean(
      region
      && heading
      && window.scrollY === 0
      && region.scrollTop === 0
      && heading.getBoundingClientRect().top >= region.getBoundingClientRect().top - 1
      && heading.getBoundingClientRect().top < window.innerHeight
    );
  })).toBe(true);
};

test('signed-out registration gate is vertically balanced on desktop and contained on mobile @registration @release', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/api/v1/dgfy/auth/me', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'Authentication required' })
  }));
  await page.route('**/api/v1/dgfy/legal-terms/current', (route) => fulfillJson(route, legalTerms));

  await page.goto('/business/grow', { waitUntil: 'domcontentloaded' });
  const declineCookiesButton = page.getByRole('button', { name: 'Decline', exact: true });
  if (await declineCookiesButton.isVisible()) await activateControl(declineCookiesButton);

  const heading = page.getByRole('heading', { name: 'Register Your Business', exact: true });
  await expect(heading).toBeVisible();
  const gate = page.getByTestId('business-registration-account-gate');
  const gateBox = await gate.boundingBox();
  expect(gateBox).not.toBeNull();
  expect(Math.abs(gateBox.y + gateBox.height / 2 - 450)).toBeLessThanOrEqual(12);
  await expect(page.getByRole('button', { name: 'Register Company Using My DGFY Account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create DGFY Account' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(heading).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'narrow mobile', width: 320, height: 740 }
]) {
  test(`registration reaches the location step without runtime or layout failures on ${viewport.name} ${viewport.name === 'desktop' ? '@desktop-only' : '@responsive'} @registration @release`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const crashChecker = registerCrashDetection(page, {
      failOnConsoleErrors: true,
      failOnClientErrors: true,
      failOnRequestFailures: true,
      failOnServerErrors: true
    });
    const state = await mockRegistrationApi(page);

    await page.goto('/business/grow', { waitUntil: 'domcontentloaded' });
    const declineCookiesButton = page.getByRole('button', { name: 'Decline', exact: true });
    if (await declineCookiesButton.isVisible()) await activateControl(declineCookiesButton);
    await expect(page.getByRole('heading', { name: 'Business details', exact: true })).toBeVisible();
    await expect(page.getByText('Enter your company name and choose the industry that best describes its main activity.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Business registration steps' })).toBeVisible();
    const stepOneButton = page.getByRole('button', { name: /step 1: business/i });
    await expect(stepOneButton).toHaveAttribute('aria-current', 'step');
    await assertMinimumTouchTarget(stepOneButton);
    if (viewport.name === 'mobile') {
      const mobileLogo = page.getByRole('img', { name: 'DGFY', exact: true });
      await expect(mobileLogo).toBeVisible();
      await expect(mobileLogo).toHaveAttribute('src', /dgfy-logo/);
      await expect.poll(() => mobileLogo.evaluate((image) => image.naturalWidth > 0)).toBe(true);
    }
    await assertNoHorizontalOverflow(page);

    const industrySelect = page.getByRole('combobox', { name: 'Business industry' });
    const companyName = page.getByLabel('Company name');
    const industryDescription = page.getByLabel('Industry (optional)');
    await expect(companyName).toHaveAttribute('placeholder', 'Enter company name');
    await assertPlaceholderFits(companyName);
    expect(await industrySelect.evaluate((element) => element.tagName)).toBe('BUTTON');
    await expect(industrySelect).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(industryDescription).toBeVisible();
    await expect(industryDescription).not.toHaveAttribute('required', '');
    await expect(industryDescription).toHaveAttribute('maxlength', '120');
    const [industryPlaceholderWeight, companyPlaceholderWeight] = await Promise.all([
      industrySelect.locator('span').evaluate((element) => window.getComputedStyle(element).fontWeight),
      companyName.evaluate((element) => window.getComputedStyle(element, '::placeholder').fontWeight)
    ]);
    expect(industryPlaceholderWeight).toBe(companyPlaceholderWeight);

    const backButton = page.getByRole('button', { name: 'Back', exact: true });
    const continueButton = page.getByRole('button', { name: /save and continue/i });
    const [backBox, continueBox] = await Promise.all([backButton.boundingBox(), continueButton.boundingBox()]);
    expect(backBox).not.toBeNull();
    expect(continueBox).not.toBeNull();
    const actionGap = continueBox.x - (backBox.x + backBox.width);
    if (viewport.width < 640) {
      expect(Math.abs(backBox.y - continueBox.y)).toBeLessThanOrEqual(1);
    }
    expect(actionGap).toBeGreaterThanOrEqual(10);
    expect(actionGap).toBeLessThanOrEqual(14);

    await crashChecker.assertNoCrashes('registration step 1');

    await companyName.fill('Release Verification Cafe');
    await activateControl(industrySelect);
    await activateControl(page.getByRole('option', { name: 'Micro Food & Beverage' }));
    await industryDescription.fill('Neighborhood cafe and bakery');
    await expect(page.getByText('Draft saved. You can refresh and resume.', { exact: true })).toBeVisible();
    await expect.poll(() => state.patchCount).toBeGreaterThanOrEqual(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Business details', exact: true })).toBeVisible();
    await expect(companyName).toHaveValue('Release Verification Cafe');
    await expect(industrySelect).toContainText('Micro Food & Beverage');
    await expect(industryDescription).toHaveValue('Neighborhood cafe and bakery');
    await activateControl(page.getByRole('button', { name: /save and continue/i }));

    await expect(page.getByRole('heading', { name: 'Storefront profile', exact: true })).toBeVisible();
    await expect(page.getByText('Add the public information customers will see.', { exact: true })).toHaveCount(0);
    await expect.poll(() => state.patchCount).toBeGreaterThanOrEqual(2);
    await expect(page.getByText('Not added', { exact: true })).toHaveCount(2);
    await expect(page.getByText('JPG or PNG, one image.', { exact: true })).toHaveCount(0);
    expect(state.draft.payload.business.industry_tag).toBe('Neighborhood cafe and bakery');
    await expect(page.getByRole('button', { name: /step 2: storefront profile/i })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('heading', { name: 'Storefront images', exact: true })).toHaveClass(/sr-only/);
    await expect(page.getByRole('heading', { name: 'Delivery Partners', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Gallery', exact: true })).toHaveCount(0);
    await expect(page.getByText('Upload optional images that will be staged with this registration for review.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Storefront contact and description', exact: true })).toHaveCount(0);
    await expect(page.getByText('All fields below are optional, but help customers recognize and contact your store.', { exact: true })).toHaveCount(0);
    await activateControl(page.getByRole('button', { name: 'Add social link', exact: true }));
    const socialPlatform = page.getByRole('combobox', { name: 'Social platform 1' });
    expect(await socialPlatform.evaluate((element) => element.tagName)).toBe('BUTTON');
    await expect(socialPlatform).toHaveAttribute('aria-haspopup', 'listbox');
    await socialPlatform.press('ArrowDown');
    await socialPlatform.press('Enter');
    await expect(socialPlatform).toContainText('Instagram');
    await activateControl(page.getByRole('button', { name: 'Remove social link 1', exact: true }));
    await page.getByLabel('Store email').fill('hello@kusinani.example');
    await page.getByLabel('Tagline').fill('Freshly made every day');
    await assertNoHorizontalOverflow(page);
    if (viewport.name === 'desktop') {
      const scrollMetrics = await page.evaluate(() => {
        const scrollRegion = document.querySelector('[role="region"][aria-labelledby="registration-step-heading"]');
        const stepper = document.querySelector('[aria-label="Business registration steps"]');
        const stepperTop = stepper.getBoundingClientRect().top;
        const heading = document.querySelector('#registration-step-heading');
        const saveButton = Array.from(scrollRegion.querySelectorAll('button')).find((button) => button.textContent.includes('Save and continue'));
        const posLink = Array.from(scrollRegion.querySelectorAll('a')).find((link) => link.textContent.includes('Sign in to POS'));
        scrollRegion.scrollTop = scrollRegion.scrollHeight;
        return {
          viewportHeight: window.innerHeight,
          documentHeight: document.documentElement.scrollHeight,
          documentOverflowY: window.getComputedStyle(document.documentElement).overflowY,
          bodyOverflowY: window.getComputedStyle(document.body).overflowY,
          regionOverflowY: window.getComputedStyle(scrollRegion).overflowY,
          regionClientHeight: scrollRegion.clientHeight,
          regionScrollHeight: scrollRegion.scrollHeight,
          regionScrollTop: scrollRegion.scrollTop,
          headingInsideRegion: scrollRegion.contains(heading),
          actionsInsideRegion: Boolean(saveButton),
          posLinkInsideRegion: Boolean(posLink),
          stepperTopBefore: stepperTop,
          stepperTopAfter: stepper.getBoundingClientRect().top
        };
      });
      expect(scrollMetrics.regionOverflowY).toBe('auto');
      expect(scrollMetrics.regionScrollHeight).toBeGreaterThan(scrollMetrics.regionClientHeight);
      expect(scrollMetrics.regionScrollTop).toBeGreaterThan(0);
      expect(scrollMetrics.headingInsideRegion).toBe(true);
      expect(scrollMetrics.actionsInsideRegion).toBe(true);
      expect(scrollMetrics.posLinkInsideRegion).toBe(true);
      expect(scrollMetrics.documentOverflowY).toBe('hidden');
      expect(scrollMetrics.bodyOverflowY).toBe('hidden');
      expect(Math.abs(scrollMetrics.stepperTopBefore - scrollMetrics.stepperTopAfter)).toBeLessThanOrEqual(1);
      const scrollRegion = page.getByRole('region', { name: 'Storefront profile' });
      await scrollRegion.evaluate((element) => { element.scrollTop = 0; });
      if (test.info().project.name.includes('safari')) {
        await scrollRegion.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      } else {
        await scrollRegion.hover();
        await page.mouse.wheel(0, 500);
      }
      await expect.poll(() => scrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await page.getByRole('navigation', { name: 'Business registration steps' }).hover();
      await page.mouse.wheel(0, 1000);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    } else {
      const mobileScrollMetrics = await page.evaluate(() => {
        const scrollRegion = document.querySelector('[role="region"][aria-labelledby="registration-step-heading"]');
        return {
          viewportHeight: window.innerHeight,
          documentHeight: document.documentElement.scrollHeight,
          regionOverflowY: window.getComputedStyle(scrollRegion).overflowY
        };
      });
      expect(mobileScrollMetrics.documentHeight).toBeGreaterThan(mobileScrollMetrics.viewportHeight);
      expect(mobileScrollMetrics.regionOverflowY).toBe('visible');
      await page.evaluate(() => window.scrollTo(0, 0));
      if (test.info().project.name.includes('safari')) {
        await page.evaluate(() => window.scrollBy(0, 500));
      } else {
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.mouse.wheel(0, 500);
      }
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    }
    await crashChecker.assertNoCrashes('registration step 2');

    await activateControl(page.getByRole('button', { name: 'Back', exact: true }));
    await expect(page.getByRole('heading', { name: 'Business details', exact: true })).toBeVisible();
    await expect(page.getByLabel('Company name')).toHaveValue('Release Verification Cafe');
    await expect(page.getByLabel('Industry (optional)')).toHaveValue('Neighborhood cafe and bakery');
    await activateControl(page.getByRole('button', { name: /save and continue/i }));
    await expect(page.getByRole('heading', { name: 'Storefront profile', exact: true })).toBeVisible();
    await expect(page.getByLabel('Store email')).toHaveValue('hello@kusinani.example');
    await expect(page.getByLabel('Tagline')).toHaveValue('Freshly made every day');
    await crashChecker.assertNoCrashes('registration resume step 2');

    await activateControl(page.getByRole('button', { name: /save and continue/i }));
    await expect(page.getByRole('heading', { name: 'Location and submission', exact: true })).toBeVisible();
    const storeLocationHeading = page.getByRole('heading', { name: 'Store Location', exact: true });
    await expect(storeLocationHeading).toBeVisible();
    await expect(page.getByText('Search for the business or place a pin on the map, then add it to your registration as the first branch.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Required agreements', exact: true })).toHaveClass(/sr-only/);
    await expect(page.getByText('These two consents are captured separately with the current published versions and stored with your submission.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Company Registration Terms', { exact: true })).toBeVisible();
    await expect(page.getByText('Marketplace Terms', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit registration', exact: true })).toBeVisible();
    const storeLocationSection = storeLocationHeading.locator('xpath=../..');
    const storeLocationSurface = await storeLocationSection.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        borderWidth: style.borderTopWidth,
        borderRadius: style.borderTopLeftRadius,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight
      };
    });
    expect(storeLocationSurface).toMatchObject({
      borderWidth: '0px',
      borderRadius: '0px',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      boxShadow: 'none',
      paddingLeft: '0px',
      paddingRight: '0px'
    });
    await expect(page.getByRole('region', { name: 'Branch location selection' })).toBeVisible();
    await activateControl(page.getByRole('button', { name: 'Add Schedule Set', exact: true }));
    for (const [weekday, label] of [
      ['Monday', 'M'],
      ['Tuesday', 'Tu'],
      ['Wednesday', 'W'],
      ['Thursday', 'Th'],
      ['Friday', 'F'],
      ['Saturday', 'Sa'],
      ['Sunday', 'Su']
    ]) {
      await expect(page.getByRole('button', { name: `Select ${weekday}`, exact: true })).toHaveText(label);
    }
    await activateControl(page.getByRole('button', { name: 'Cancel', exact: true }));
    const selectionPanel = page.getByRole('region', { name: 'Branch location selection' });
    await expect(selectionPanel.getByLabel('Business address')).toHaveCount(0);
    await expect(page.getByRole('search', { name: 'Search for a storefront location' })).toBeVisible();
    const mapSurface = page.getByRole('application', { name: 'Map location picker' });
    await expect(mapSurface).toBeVisible();
    if (viewport.width < 640) {
      const mapBox = await mapSurface.boundingBox();
      expect(mapBox).not.toBeNull();
      expect(mapBox.height).toBeGreaterThanOrEqual(240);
    }
    expect(await selectionPanel.evaluate((panel, map) => Boolean(panel.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING), await mapSurface.elementHandle())).toBe(true);
    await expect(page.getByLabel('Latitude')).toHaveCount(0);
    await expect(page.getByLabel('Longitude')).toHaveCount(0);
    await expect(page.getByText('Search for an address below or click the map to place a pin. Then add it as your first branch location.')).toBeVisible();
    const addressSearch = page.getByRole('search', { name: 'Search for a storefront location' });
    const addLocationButton = page.getByRole('button', { name: 'Add branch location' });
    const embeddedSearchButton = addressSearch.getByRole('button', { name: 'Search address' });
    await expect(embeddedSearchButton).toBeVisible();
    await expect(addLocationButton).toBeDisabled();
    const searchInput = addressSearch.getByLabel('Search business address');
    if (viewport.width < 640) await assertPlaceholderFits(searchInput);
    await expect(searchInput).not.toHaveClass(/shadow-\[0_0_14px/);
    const searchInputBox = await addressSearch.getByLabel('Search business address').boundingBox();
    const embeddedSearchBox = await embeddedSearchButton.boundingBox();
    const addLocationBox = await addLocationButton.boundingBox();
    expect(searchInputBox).not.toBeNull();
    expect(embeddedSearchBox).not.toBeNull();
    expect(addLocationBox).not.toBeNull();
    expect(embeddedSearchBox.x).toBeGreaterThanOrEqual(searchInputBox.x);
    expect(embeddedSearchBox.x + embeddedSearchBox.width).toBeLessThanOrEqual(searchInputBox.x + searchInputBox.width);
    if (viewport.width < 640) {
      expect(addLocationBox.x).toBeGreaterThanOrEqual(searchInputBox.x + searchInputBox.width);
      expect(Math.abs(addLocationBox.y + addLocationBox.height / 2 - (searchInputBox.y + searchInputBox.height / 2))).toBeLessThan(2);
    } else {
      expect(addLocationBox.x).toBeGreaterThanOrEqual(searchInputBox.x + searchInputBox.width);
      expect(Math.abs((addLocationBox.y + addLocationBox.height / 2) - (searchInputBox.y + searchInputBox.height / 2))).toBeLessThan(2);
    }
    await addressSearch.getByLabel('Search business address').fill('Jaro Plaza');
    await activateControl(addressSearch.getByRole('button', { name: 'Search address' }));
    await activateControl(page.getByRole('option', { name: 'Jaro Plaza, Iloilo City' }));
    await expect(page.getByRole('textbox', { name: 'Business address' })).toHaveValue('Jaro Plaza, Iloilo City');
    await selectionPanel.getByLabel(/Street no\., unit, floor or building/).fill('Unit 2');
    await expect(addLocationButton).toBeEnabled();
    await activateControl(addLocationButton);
    await expect(page.getByText('Added to registration draft')).toBeVisible();
    const changeLocationButton = page.getByRole('button', { name: 'Change branch location' });
    await expect(changeLocationButton).toHaveAttribute('title', 'Change location');
    await assertMinimumTouchTarget(changeLocationButton);
    await activateControl(changeLocationButton);
    await expect(selectionPanel.getByRole('heading', { name: 'Selected location', exact: true })).toBeVisible();
    await expect(selectionPanel.getByLabel('Business address')).toHaveValue('Jaro Plaza, Iloilo City');
    await expect(searchInput).toHaveClass(/shadow-\[0_0_14px/);
    await expect(searchInput).toHaveCSS('box-shadow', /rgb/);
    await activateControl(selectionPanel.getByRole('button', { name: 'Cancel', exact: true }));
    await expect(changeLocationButton).toBeVisible();
    await expect(searchInput).not.toHaveClass(/shadow-\[0_0_14px/);
    await expect.poll(() => state.patchCount).toBeGreaterThanOrEqual(6);
    expect(state.draft.payload.location).toMatchObject({
      address_line: 'Unit 2, Jaro Plaza, Iloilo City',
      address_details: 'Unit 2',
      latitude: 10.725,
      longitude: 122.56
    });
    await assertNoHorizontalOverflow(page);
    await crashChecker.assertNoCrashes('registration business location');
  });
}

test('first-visit consent stays in flow and does not cover registration controls @registration @release', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.removeItem('dgfy_analytics_consent_v1'));
  await mockRegistrationApi(page);

  await page.goto('/business/grow', { waitUntil: 'domcontentloaded' });
  const consentBanner = page.getByRole('region', { name: 'Privacy and analytics consent' });
  await expect(consentBanner).toBeVisible();
  await expect(consentBanner).toHaveCSS('position', 'static');

  await page.getByLabel('Company name').fill('Acme Corp');
  const industrySelect = page.getByRole('combobox', { name: 'Business industry' });
  await activateControl(industrySelect);
  await activateControl(page.getByRole('option', { name: 'Micro Food & Beverage' }));
  await activateControl(page.getByRole('button', { name: /save and continue/i }));
  await expect(page.getByRole('heading', { name: 'Storefront profile', exact: true })).toBeVisible();
  await activateControl(page.getByRole('button', { name: /save and continue/i }));
  await expect(page.getByRole('heading', { name: 'Location and submission', exact: true })).toBeVisible();

  await activateControl(page.getByRole('button', { name: 'Add Schedule Set', exact: true }), { preferTouch: false });
  const openTime = page.getByRole('button', { name: /^Open Time:/ });
  await openTime.click();
  const doneButton = page.getByRole('group', { name: 'Open Time roller time picker' }).getByRole('button', { name: 'Done', exact: true });
  await expect(doneButton).toBeVisible();

  const [bannerBox, doneBox] = await Promise.all([consentBanner.boundingBox(), doneButton.boundingBox()]);
  expect(bannerBox).not.toBeNull();
  expect(doneBox).not.toBeNull();
  const overlaps = bannerBox.x < doneBox.x + doneBox.width
    && bannerBox.x + bannerBox.width > doneBox.x
    && bannerBox.y < doneBox.y + doneBox.height
    && bannerBox.y + bannerBox.height > doneBox.y;
  expect(overlaps).toBe(false);

  await doneButton.click();
  await expect(openTime).toHaveAttribute('aria-expanded', 'false');
});

test('step changes reset registration scroll across 14 responsive viewports @registration @release', async ({ page }) => {
  test.setTimeout(120000);
  const viewports = [
    { width: 320, height: 568 },
    { width: 320, height: 740 },
    { width: 360, height: 640 },
    { width: 360, height: 800 },
    { width: 375, height: 667 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 414, height: 896 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 }
  ];

  await page.setViewportSize({ width: 1280, height: 900 });
  await mockRegistrationApi(page);
  await page.goto('/business/grow', { waitUntil: 'domcontentloaded' });
  const declineCookiesButton = page.getByRole('button', { name: 'Decline', exact: true });
  if (await declineCookiesButton.isVisible()) await activateControl(declineCookiesButton);

  await expect(page.getByRole('heading', { name: 'Business details', exact: true })).toBeVisible();
  const companyName = page.getByLabel('Company name');
  const industrySelect = page.getByRole('combobox', { name: 'Business industry' });
  await companyName.fill('Acme Corp');
  await activateControl(industrySelect);
  await activateControl(page.getByRole('option', { name: 'Micro Food & Beverage' }));

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await assertPlaceholderFits(companyName);
    await scrollActiveRegistrationStepToBottom(page);
    const saveAndContinue = page.getByRole('button', { name: /save and continue/i });
    await saveAndContinue.scrollIntoViewIfNeeded();
    await activateControl(saveAndContinue);
    await expectRegistrationStepAtTop(page, 'Storefront profile');

    await scrollActiveRegistrationStepToBottom(page);
    await saveAndContinue.scrollIntoViewIfNeeded();
    await activateControl(saveAndContinue);
    await expectRegistrationStepAtTop(page, 'Location and submission');
    await assertNoHorizontalOverflow(page);

    await activateControl(page.getByRole('button', { name: 'Back', exact: true }));
    await expectRegistrationStepAtTop(page, 'Storefront profile');
    await activateControl(page.getByRole('button', { name: 'Back', exact: true }));
    await expectRegistrationStepAtTop(page, 'Business details');
  }
});

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

import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/login.js';
import { hasTestCredentials, testCredentials } from './fixtures/test-credentials.js';

const testCompanyName = process.env.E2E_TEST_COMPANY_NAME?.trim();

const installRuntimeDiagnostics = (page) => {
    const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], serverErrors: [] };
    page.on('pageerror', (error) => diagnostics.pageErrors.push(String(error?.stack || error)));
    page.on('console', (message) => {
        if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
        diagnostics.failedRequests.push({
            method: request.method(),
            url: request.url(),
            failure: request.failure()?.errorText || 'unknown request failure'
        });
    });
    page.on('response', (response) => {
        if (response.status() >= 500) {
            diagnostics.serverErrors.push({
                method: response.request().method(),
                url: response.url(),
                status: response.status()
            });
        }
    });
    return diagnostics;
};

const assertHealthy = async (page, diagnostics) => {
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByText(/Something went wrong|Application error|Unexpected error/i)).toHaveCount(0);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
    const unexpectedFailures = diagnostics.failedRequests.filter((request) => !(
        request.method === 'GET'
        && request.failure === 'net::ERR_ABORTED'
        && /\/api\/v1\/pos\/catalog\/events$/.test(request.url)
    ));
    expect(unexpectedFailures).toEqual([]);
    expect(diagnostics.serverErrors).toEqual([]);
};

const manilaToday = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date());

const shiftDateOnly = (dateValue, days) => {
    const [year, month, day] = dateValue.split('-').map(Number);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(Date.UTC(year, month - 1, day + days)));
};

const waitForBusinessAdminResponse = (page, endpoint, dateFrom, dateTo) => page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET'
        && url.pathname.endsWith(endpoint)
        && url.searchParams.get('date_from') === dateFrom
        && url.searchParams.get('date_to') === dateTo;
});

test.describe('Phase 375 Business Admin historical data visibility', () => {
    test.skip(
        !hasTestCredentials,
        'Set E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD for the authenticated local flow.'
    );
    test.describe.configure({ timeout: 120_000 });

    test('loads bounded history for Shifts, Orders, and Audit and exposes date presets', async ({ page }) => {
        const diagnostics = installRuntimeDiagnostics(page);
        await signIn(page, testCredentials, { companyName: testCompanyName });

        const today = manilaToday();
        const last30Start = shiftDateOnly(today, -29);
        const routes = [
            { section: 'shifts', endpoint: '/api/v1/business-admin/shifts', heading: 'Shifts & cash' },
            { section: 'orders', endpoint: '/api/v1/business-admin/orders', heading: 'Orders' },
            { section: 'audit', endpoint: '/api/v1/business-admin/audit', heading: 'Audit logs' }
        ];

        for (const route of routes) {
            const responsePromise = waitForBusinessAdminResponse(page, route.endpoint, last30Start, today);
            await page.goto(`/?view=reports#/backoffice/${route.section}`, { waitUntil: 'domcontentloaded' });
            const response = await responsePromise;
            expect(response.status()).toBe(200);
            const payload = await response.json();
            expect(payload.data).toBeTruthy();
            expect(Number(payload.data.pagination?.total || 0), `${route.section} should expose the local tenant history in the default range`).toBeGreaterThan(0);
            if (route.section === 'audit') expect(new URL(response.url()).searchParams.get('branch_id')).toBeNull();
            await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
            await expect(page.getByLabel('Date range')).toHaveValue('last_30_days');
            await expect(page.getByLabel('From')).toHaveValue(last30Start);
            await expect(page.getByLabel('To')).toHaveValue(today);
            await expect(page.locator('.business-admin-table tbody tr').first()).toBeVisible();
            if (route.section === 'audit') await expect(page.getByLabel('Branch')).toHaveCount(0);
            if (route.section === 'orders') {
                for (const receiptType of ['sales', 'refund', 'voided']) {
                    const receiptResponsePromise = page.waitForResponse((response) => {
                        const url = new URL(response.url());
                        return response.request().method() === 'GET'
                            && url.pathname.endsWith('/api/v1/business-admin/orders')
                            && url.searchParams.get('date_from') === last30Start
                            && url.searchParams.get('date_to') === today
                            && url.searchParams.get('receipt_type') === receiptType;
                    });
                    await page.getByLabel('Receipt type').selectOption(receiptType);
                    const receiptResponse = await receiptResponsePromise;
                    expect(receiptResponse.status()).toBe(200);
                }
                await expect(page.getByLabel('Receipt type')).toHaveValue('voided');
            }
        }

        await page.goto('/?view=reports#/backoffice/audit', { waitUntil: 'domcontentloaded' });
        const todayResponsePromise = waitForBusinessAdminResponse(page, '/api/v1/business-admin/audit', today, today);
        await page.getByLabel('Date range').selectOption('today');
        expect((await todayResponsePromise).status()).toBe(200);
        await expect(page.getByLabel('From')).toHaveValue(today);
        await expect(page.getByLabel('To')).toHaveValue(today);

        const last30ResponsePromise = waitForBusinessAdminResponse(page, '/api/v1/business-admin/audit', last30Start, today);
        await page.getByLabel('Date range').selectOption('last_30_days');
        expect((await last30ResponsePromise).status()).toBe(200);
        await expect(page.getByLabel('From')).toHaveValue(last30Start);
        await expect(page.getByLabel('To')).toHaveValue(today);

        const customStart = shiftDateOnly(today, -1);
        const customResponsePromise = waitForBusinessAdminResponse(page, '/api/v1/business-admin/audit', customStart, today);
        await page.getByLabel('From').fill(customStart);
        expect((await customResponsePromise).status()).toBe(200);
        await expect(page.getByLabel('Date range')).toHaveValue('custom');
        await expect(page.getByLabel('From')).toHaveValue(customStart);

        await assertHealthy(page, diagnostics);
    });
});

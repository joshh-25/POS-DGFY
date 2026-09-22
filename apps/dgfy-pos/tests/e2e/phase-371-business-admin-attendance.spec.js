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

test.describe('Phase 371 Business Admin attendance workspace', () => {
    test.skip(
        !hasTestCredentials,
        'Set E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD for the authenticated local flow.'
    );
    test.describe.configure({ timeout: 120_000 });

    test('renders scoped attendance and operator-session read models without a blank page', async ({ page }) => {
        const diagnostics = installRuntimeDiagnostics(page);
        await signIn(page, testCredentials, { companyName: testCompanyName });

        const attendanceResponsePromise = page.waitForResponse((response) => (
            response.request().method() === 'GET'
            && new URL(response.url()).pathname.endsWith('/api/v1/business-admin/attendance')
        ));
        await page.goto('/?view=reports#/backoffice/attendance', { waitUntil: 'domcontentloaded' });
        const attendanceResponse = await attendanceResponsePromise;
        expect(attendanceResponse.status()).toBe(200);
        const attendancePayload = await attendanceResponse.json();
        expect(attendancePayload.data).toEqual(expect.objectContaining({
            attendance: expect.objectContaining({ rows: expect.any(Array) }),
            operators: expect.objectContaining({ rows: expect.any(Array) })
        }));

        await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible();
        await expect(page.getByLabel('From')).toBeVisible();
        await expect(page.getByLabel('To')).toBeVisible();
        await expect(page.getByLabel('Branch')).toBeVisible();
        await expect(page.getByText('Attendance sessions', { exact: true }).last()).toBeVisible();
        await expect(page.getByText('Operator sessions', { exact: true }).last()).toBeVisible();
        await expect(page.getByText(/No attendance sessions were recorded for these filters\.|[0-9]+ sessions in the selected scope/)).toBeVisible();
        await expect(page.getByText(/No operator sessions were recorded for these filters\.|[0-9]+ terminal sessions in the selected scope/)).toBeVisible();

        const branch = page.getByLabel('Branch');
        const branchValues = await branch.locator('option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
        if (branchValues.length) {
            const filteredResponsePromise = page.waitForResponse((response) => (
                response.request().method() === 'GET'
                && new URL(response.url()).pathname.endsWith('/api/v1/business-admin/attendance')
                && new URL(response.url()).searchParams.get('branch_id') === branchValues[0]
            ));
            await branch.selectOption(branchValues[0]);
            expect((await filteredResponsePromise).status()).toBe(200);
        }

        await assertHealthy(page, diagnostics);
    });
});

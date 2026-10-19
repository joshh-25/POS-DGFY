// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PushDiagnostics from '../../../Pages/PushDiagnostics.jsx';

const mocks = vi.hoisted(() => ({
    getPushDiagnosticsOverview: vi.fn(),
    getPushDiagnosticsVisibility: vi.fn(),
    setPushDiagnosticsVisibility: vi.fn(),
    listPushDiagnosticsRegistrations: vi.fn(),
    listPushDiagnosticsAttempts: vi.fn(),
    listPushDiagnosticDevices: vi.fn(),
    createPushDiagnosticEnrollmentCode: vi.fn(),
    revokePushDiagnosticDevice: vi.fn(),
    sendPushDiagnosticTest: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn()
}));

vi.mock('@/services/adminService', () => ({
    getPushDiagnosticsOverview: mocks.getPushDiagnosticsOverview,
    getPushDiagnosticsVisibility: mocks.getPushDiagnosticsVisibility,
    setPushDiagnosticsVisibility: mocks.setPushDiagnosticsVisibility,
    listPushDiagnosticsRegistrations: mocks.listPushDiagnosticsRegistrations,
    listPushDiagnosticsAttempts: mocks.listPushDiagnosticsAttempts,
    listPushDiagnosticDevices: mocks.listPushDiagnosticDevices,
    createPushDiagnosticEnrollmentCode: mocks.createPushDiagnosticEnrollmentCode,
    revokePushDiagnosticDevice: mocks.revokePushDiagnosticDevice,
    sendPushDiagnosticTest: mocks.sendPushDiagnosticTest
}));

vi.mock('sonner', () => ({
    toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const emptyOverview = (environment = 'staging') => ({
    environment: { label: environment, source: 'DEPLOY_ENV_LABEL' },
    generated_at: '2026-10-19T08:00:00.000Z',
    readiness: {
        provider: { configured_mode: 'expo', effective_mode: 'expo', fake_blocked_in_production: false },
        expo_access_token_present: true,
        token_hash_secret_present: true,
        token_hash_ready: true,
        guest_proof_secret_present: true,
        delivery_log_enabled: true,
        retention_enabled: true,
        receipt_scheduler: { scheduled: true, last_cycle_completed_at: '2026-10-19T07:55:00.000Z' }
    },
    registrations: [],
    outcomes: {
        last_24h: { deliveries: [], dispatch_events: [] },
        last_7d: { deliveries: [], dispatch_events: [] }
    }
});

const activeDevice = {
    id: 'diagnostic-device-1',
    ref: 'a1b2c3d4e5f6',
    platform: 'ios',
    app: 'storefront',
    brand: 'DGFY',
    state: 'active',
    last_seen_at: '2026-10-19T07:00:00.000Z'
};

const renderPage = () => render(<PushDiagnostics />);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPushDiagnosticsOverview.mockResolvedValue(emptyOverview());
    mocks.getPushDiagnosticsVisibility.mockResolvedValue({ apps: [
        { app: 'storefront', enabled: false, updated_at: null },
        { app: 'pos', enabled: false, updated_at: null },
        { app: 'fiscalpos', enabled: false, updated_at: null }
    ] });
    mocks.listPushDiagnosticsRegistrations.mockResolvedValue({ environment: { label: 'staging' }, items: [] });
    mocks.listPushDiagnosticsAttempts.mockResolvedValue({ environment: { label: 'staging' }, deliveries: [], dispatch_events: [] });
    mocks.listPushDiagnosticDevices.mockResolvedValue({ environment: { label: 'staging' }, items: [] });
    mocks.createPushDiagnosticEnrollmentCode.mockResolvedValue({ code: 'DGFY-ONE-TIME-72AF', expires_at: '2026-10-19T08:10:00.000Z' });
    mocks.revokePushDiagnosticDevice.mockResolvedValue({ revoked: true });
    mocks.sendPushDiagnosticTest.mockResolvedValue({ state: 'accepted_receipt_pending', status: 'accepted', simulated: false });
    mocks.setPushDiagnosticsVisibility.mockImplementation(async (app, enabled) => ({ app, enabled, changed: true }));
});

afterEach(() => {
    cleanup();
});

describe('PushDiagnostics', () => {
    test.each(['staging', 'production', 'unknown'])('identifies the connected %s environment', async (environment) => {
        mocks.getPushDiagnosticsOverview.mockResolvedValue(emptyOverview(environment));

        renderPage();

        expect(await screen.findByText(environment + ' environment')).toBeTruthy();
        expect(screen.getByText('This page reads only the connected API environment.')).toBeTruthy();
        if (environment === 'unknown') {
            expect(screen.getByText(/Set DEPLOY_ENV_LABEL in the API environment file/i)).toBeTruthy();
        }
    });

    test('shows explicit empty states for registrations, attempts, dispatch decisions, and devices', async () => {
        renderPage();

        expect(await screen.findByText('No push registration summary is available.')).toBeTruthy();
        expect(screen.getByText('No registrations match this filter.')).toBeTruthy();
        expect(screen.getByText('No delivery attempts in this window.')).toBeTruthy();
        expect(screen.getByText('No dispatch decisions in this window.')).toBeTruthy();
        expect(screen.getByText('No diagnostic devices have been enrolled.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Send test notification' }).disabled).toBe(true);
        expect(screen.getByText(/Test notifications stay disabled until a mobile or POS client completes enrollment/i)).toBeTruthy();
        for (const app of ['Storefront', 'POS', 'Fiscal POS']) {
            expect(screen.getByRole('switch', { name: `${app} diagnostics visibility` }).getAttribute('aria-checked')).toBe('false');
        }
    });

    test('requires confirmation and waits for the server before changing app visibility', async () => {
        let resolveChange;
        mocks.setPushDiagnosticsVisibility.mockImplementationOnce(() => new Promise((resolve) => { resolveChange = resolve; }));
        mocks.getPushDiagnosticsVisibility
            .mockResolvedValueOnce({ apps: [
                { app: 'storefront', enabled: false, updated_at: null },
                { app: 'pos', enabled: false, updated_at: null },
                { app: 'fiscalpos', enabled: false, updated_at: null }
            ] })
            .mockResolvedValue({ apps: [
                { app: 'storefront', enabled: true, updated_at: '2026-10-19T08:10:00.000Z' },
                { app: 'pos', enabled: false, updated_at: null },
                { app: 'fiscalpos', enabled: false, updated_at: null }
            ] });

        renderPage();
        const toggle = await screen.findByRole('switch', { name: 'Storefront diagnostics visibility' });
        fireEvent.click(toggle);
        expect(mocks.setPushDiagnosticsVisibility).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/does not affect enrollment or test sends/i)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enable Storefront diagnostics' }));

        await waitFor(() => expect(mocks.setPushDiagnosticsVisibility).toHaveBeenCalledWith('storefront', true));
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        await act(async () => {
            resolveChange({ app: 'storefront', enabled: true, changed: true });
        });
        await waitFor(() => expect(screen.getByRole('switch', { name: 'Storefront diagnostics visibility' }).getAttribute('aria-checked')).toBe('true'));
    });

    test('keeps visibility unchanged when the confirmed update fails', async () => {
        mocks.setPushDiagnosticsVisibility.mockRejectedValueOnce(new Error('Visibility update failed.'));
        renderPage();
        const toggle = await screen.findByRole('switch', { name: 'POS diagnostics visibility' });
        fireEvent.click(toggle);
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enable POS diagnostics' }));

        expect(await screen.findByText('Visibility update failed.')).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'POS diagnostics visibility' }).getAttribute('aria-checked')).toBe('false');
    });

    test('maps provider acceptance and receipt states with careful labels', async () => {
        mocks.listPushDiagnosticsAttempts.mockResolvedValue({
            deliveries: [
                { state: 'accepted_receipt_pending', purpose: 'order_status', sent_at: '2026-10-19T07:00:00.000Z', registration_ref: 'safe-ref-123456', correlation_ref: 'order-ref-123456' },
                { state: 'receipt_ok', purpose: 'diagnostic_test', sent_at: '2026-10-19T06:00:00.000Z', registration_ref: 'safe-ref-abcdef', correlation_ref: null },
                { state: 'rejected_by_expo', purpose: 'order_status', sent_at: '2026-10-19T05:00:00.000Z', registration_ref: null, correlation_ref: 'order-ref-abcdef' }
            ],
            dispatch_events: []
        });

        renderPage();

        expect((await screen.findAllByText('Accepted by Expo · Receipt pending')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('Receipt OK').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Rejected by Expo').length).toBeGreaterThan(0);
        expect(screen.queryByText(/delivered|shown/i)).toBeNull();
    });

    test('renders only safe metadata when unexpected sensitive fields are present', async () => {
        mocks.listPushDiagnosticsRegistrations.mockResolvedValue({
            items: [{
                ref: 'safe-registration-ref',
                owner_type: 'guest',
                app: 'storefront',
                brand: 'DGFY',
                platform: 'android',
                state: 'active',
                last_seen_at: '2026-10-19T07:00:00.000Z',
                raw_token: 'ExponentPushToken[never-render-this]',
                customer_email: 'customer@example.test',
                tracking_pin: 'PIN-9012',
                owner_id: 'owner-9921'
            }]
        });
        mocks.listPushDiagnosticsAttempts.mockResolvedValue({
            deliveries: [{
                state: 'receipt_ok',
                purpose: 'order_status',
                sent_at: '2026-10-19T07:00:00.000Z',
                registration_ref: 'safe-registration-ref',
                correlation_ref: 'safe-correlation-ref',
                token: 'ExponentPushToken[never-render-this]',
                provider_ticket_id: 'ticket-secret-id'
            }],
            dispatch_events: []
        });

        renderPage();

        expect((await screen.findAllByText('safe-registration-ref')).length).toBeGreaterThan(0);
        expect(screen.queryByText(/ExponentPushToken|customer@example\.test|PIN-9012|owner-9921|ticket-secret-id/)).toBeNull();
    });

    test('shows the one-time enrollment code and does not send a test notification', async () => {
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Generate enrollment code' }));

        expect(await screen.findByText('DGFY-ONE-TIME-72AF')).toBeTruthy();
        expect(screen.getByText(/Expires:/)).toBeTruthy();
        expect(mocks.createPushDiagnosticEnrollmentCode).toHaveBeenCalledTimes(1);
        expect(mocks.createPushDiagnosticEnrollmentCode.mock.calls[0]).toHaveLength(0);
        expect(mocks.sendPushDiagnosticTest).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByText('DGFY-ONE-TIME-72AF')).toBeNull();
    });

    test('requires an enrolled device and explicit confirmation before sending, and shows rate limits', async () => {
        mocks.listPushDiagnosticDevices.mockResolvedValue({ items: [activeDevice] });
        mocks.sendPushDiagnosticTest.mockRejectedValueOnce({
            response: { status: 429, data: { message: 'Platform Admin test-send limit reached.' } }
        });

        renderPage();

        const sendButton = await screen.findByRole('button', { name: 'Send test notification' });
        await waitFor(() => expect(sendButton.disabled).toBe(false));
        fireEvent.click(sendButton);
        expect(mocks.sendPushDiagnosticTest).not.toHaveBeenCalled();

        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Send test notification' }));

        await waitFor(() => expect(mocks.sendPushDiagnosticTest).toHaveBeenCalledTimes(1));
        expect(mocks.sendPushDiagnosticTest.mock.calls[0]).toEqual(['diagnostic-device-1']);
        expect((await screen.findAllByText('Platform Admin test-send limit reached.')).length).toBeGreaterThan(0);
    });

    test('keeps the last successful snapshot visible when refresh fails', async () => {
        mocks.getPushDiagnosticsVisibility.mockResolvedValue({ apps: [
            { app: 'storefront', enabled: true, updated_at: '2026-10-19T07:00:00.000Z' },
            { app: 'pos', enabled: false, updated_at: null },
            { app: 'fiscalpos', enabled: false, updated_at: null }
        ] });
        renderPage();
        expect(await screen.findByText('staging environment')).toBeTruthy();
        mocks.getPushDiagnosticsOverview.mockRejectedValueOnce(new Error('API temporarily unavailable'));

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

        expect(await screen.findByText('Could not refresh push diagnostics.')).toBeTruthy();
        expect(screen.getByText(/Showing the last successful snapshot/)).toBeTruthy();
        expect(screen.getByText('staging environment')).toBeTruthy();
        expect(screen.getByRole('switch', { name: 'Storefront diagnostics visibility' }).getAttribute('aria-checked')).toBe('true');
    });
});

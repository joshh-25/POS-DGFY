// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContactInquiriesDashboard from '../../../Pages/ContactInquiriesDashboard.jsx';

const mocks = vi.hoisted(() => ({
    getPin4msProviderConfigStatus: vi.fn(),
    savePin4msProviderApiKey: vi.fn(),
    toastSuccess: vi.fn()
}));

vi.mock('@/services/adminService', () => ({
    getPin4msProviderConfigStatus: mocks.getPin4msProviderConfigStatus,
    savePin4msProviderApiKey: mocks.savePin4msProviderApiKey
}));

vi.mock('sonner', () => ({
    toast: { success: mocks.toastSuccess }
}));

const unconfiguredStatus = {
    configured: false,
    updatedAt: null,
    secureStorageAvailable: true,
    submissionSyncAvailable: false
};

describe('ContactInquiriesDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
        mocks.getPin4msProviderConfigStatus.mockResolvedValue(unconfiguredStatus);
        mocks.savePin4msProviderApiKey.mockResolvedValue({
            ...unconfiguredStatus,
            configured: true,
            updatedAt: '2026-10-14T00:00:00.000Z'
        });
    });

    afterEach(() => {
        cleanup();
    });

    test('shows an honest unsynced inbox and saves the key without keeping it in the field', async () => {
        render(<ContactInquiriesDashboard />);

        expect(await screen.findByText('Sync not connected')).toBeTruthy();
        expect(screen.getByText(/does not verify the provider connection or load submissions/i)).toBeTruthy();

        const keyField = screen.getByLabelText('Pin4MS API key');
        fireEvent.change(keyField, { target: { value: 'generated-pin4ms-key' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save API key' }));

        await waitFor(() => expect(mocks.savePin4msProviderApiKey).toHaveBeenCalledWith('generated-pin4ms-key'));
        await waitFor(() => expect(keyField.value).toBe(''));
        expect(mocks.toastSuccess).toHaveBeenCalledWith('Pin4MS API key saved securely.');
        expect(screen.getByText('Key saved')).toBeTruthy();
    });

    test('disables key entry on an insecure LAN address', async () => {
        Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
        render(<ContactInquiriesDashboard />);

        const keyField = await screen.findByLabelText('Pin4MS API key');
        expect(keyField.disabled).toBe(true);
        expect(screen.getByText(/Open Admin over HTTPS or localhost/i)).toBeTruthy();
    });

    test('keeps key entry disabled when API-side encryption is not configured', async () => {
        mocks.getPin4msProviderConfigStatus.mockResolvedValue({
            ...unconfiguredStatus,
            secureStorageAvailable: false
        });
        render(<ContactInquiriesDashboard />);

        const keyField = await screen.findByLabelText('Pin4MS API key');
        expect(keyField.disabled).toBe(true);
        expect(screen.getByText(/Secure key storage is not configured/i)).toBeTruthy();
    });
});

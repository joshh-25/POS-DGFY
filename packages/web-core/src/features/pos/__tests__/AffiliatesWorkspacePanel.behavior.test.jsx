/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AffiliatesWorkspacePanel from '../components/AffiliatesWorkspacePanel.jsx';

const fetchAffiliateSettings = vi.fn();
const fetchAffiliates = vi.fn();
const fetchAffiliateCashouts = vi.fn();
const fetchAffiliateInvites = vi.fn();
const fetchAffiliatePriceRules = vi.fn();

vi.mock('../services/affiliateService.js', () => ({
    fetchAffiliateSettings: (...args) => fetchAffiliateSettings(...args),
    fetchAffiliates: (...args) => fetchAffiliates(...args),
    fetchAffiliateCashouts: (...args) => fetchAffiliateCashouts(...args),
    fetchAffiliateInvites: (...args) => fetchAffiliateInvites(...args),
    fetchAffiliatePriceRules: (...args) => fetchAffiliatePriceRules(...args),
    approveAffiliateCashout: vi.fn(),
    fetchAffiliateQrPayload: vi.fn(),
    inviteAffiliate: vi.fn(),
    cancelAffiliateInvite: vi.fn(),
    markAffiliateCashoutPaid: vi.fn(),
    rejectAffiliateCashout: vi.fn(),
    updateAffiliateEnrollment: vi.fn(),
    reactivateAffiliateEnrollment: vi.fn(),
    updateAffiliateSettings: vi.fn(),
    upsertAffiliatePriceRule: vi.fn(),
    deactivateAffiliatePriceRule: vi.fn()
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}));

const settings = {
    program_enabled: true,
    default_rate_bps: 500,
    min_cashout_centavos: 0,
    auto_approve_enrollment: false
};

const affiliate = (overrides = {}) => ({
    enrollment_id: 101,
    short_code: 'AF-ABC234',
    status: 'revoked',
    dgfyAccount: { first_name: 'Ari', last_name: 'Affiliate' },
    earnings: { pending_centavos: 0, available_centavos: 0, paid_centavos: 0 },
    revoked_at: '2026-08-30T12:34:00.000Z',
    revoked_by: 42,
    revocation_reason: 'Repeated policy violation',
    ...overrides
});

const viewer = { permissions: ['affiliates:view'] };

const renderPanel = () => render(<AffiliatesWorkspacePanel terminalUser={viewer} sectionId="affiliates" />);

beforeEach(() => {
    fetchAffiliateSettings.mockResolvedValue(settings);
    fetchAffiliates.mockResolvedValue([affiliate()]);
    fetchAffiliateCashouts.mockResolvedValue([]);
    fetchAffiliateInvites.mockResolvedValue([]);
    fetchAffiliatePriceRules.mockResolvedValue([]);
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('AffiliatesWorkspacePanel revocation audit display (#1203 Phase 215)', () => {
    it('renders the existing latest audit fields without an actor lookup', async () => {
        renderPanel();

        expect(await screen.findByText('Latest status-audit')).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Latest status-audit' })).toBeTruthy();
        expect(screen.getByText('Tenant user ID')).toBeTruthy();
        expect(screen.getByText('42')).toBeTruthy();
        expect(screen.getByText('Repeated policy violation')).toBeTruthy();
        expect(screen.getByText(/Aug 30, 2026/)).toBeTruthy();
        expect(fetchAffiliates).toHaveBeenCalledTimes(1);
    });

    it('keeps a preserved historical audit visible when the enrollment is active again', async () => {
        fetchAffiliates.mockResolvedValueOnce([affiliate({ status: 'active' })]);
        renderPanel();

        expect(await screen.findByText('Latest status-audit')).toBeTruthy();
        expect(screen.getByText(/Status: active/)).toBeTruthy();
        expect(screen.getByText('Repeated policy violation')).toBeTruthy();
    });

    it('uses explicit fallbacks for missing actor and reason', async () => {
        fetchAffiliates.mockResolvedValueOnce([affiliate({ revoked_by: null, revocation_reason: null })]);
        renderPanel();

        expect(await screen.findByText('Actor not recorded')).toBeTruthy();
        expect(screen.getByText('Not recorded')).toBeTruthy();
    });

    it('does not render an audit block when no audit timestamp exists', async () => {
        fetchAffiliates.mockResolvedValueOnce([affiliate({ revoked_at: null, revoked_by: null, revocation_reason: null })]);
        renderPanel();

        expect(await screen.findByText('Ari Affiliate')).toBeTruthy();
        expect(screen.queryByText('Latest status-audit')).toBeNull();
    });

    it('renders an invalid non-empty timestamp safely', async () => {
        fetchAffiliates.mockResolvedValueOnce([affiliate({ revoked_at: 'not-a-date' })]);
        renderPanel();

        expect(await screen.findByText('Unknown time')).toBeTruthy();
    });

    it('preserves the existing empty-affiliates message', async () => {
        fetchAffiliates.mockResolvedValueOnce([]);
        renderPanel();

        expect(await screen.findByText('No affiliates enrolled yet.')).toBeTruthy();
        expect(screen.queryByText('Latest status-audit')).toBeNull();
    });
});

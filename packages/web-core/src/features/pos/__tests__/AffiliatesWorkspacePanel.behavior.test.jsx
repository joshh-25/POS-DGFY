/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    isIminWrapperRuntime: vi.fn(() => false),
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
const manager = { permissions: ['affiliates:view', 'affiliates:manage', 'affiliates:settings'] };

const renderPanel = (terminalUser = viewer) => render(<AffiliatesWorkspacePanel terminalUser={terminalUser} sectionId="affiliates" />);

beforeEach(() => {
    fetchAffiliateSettings.mockResolvedValue(settings);
    fetchAffiliates.mockResolvedValue([affiliate()]);
    fetchAffiliateCashouts.mockResolvedValue([]);
    fetchAffiliateInvites.mockResolvedValue([]);
    fetchAffiliatePriceRules.mockResolvedValue([]);
});

afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/?view=settings_affiliates#/terminal');
    vi.clearAllMocks();
});

describe('AffiliatesWorkspacePanel revocation audit display (#1203 Phase 215)', () => {
    it('renders the existing latest audit fields without an actor lookup', async () => {
        renderPanel();

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Ari Affiliate' }));
        expect(await screen.findByText('Latest status-audit')).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Latest status-audit' })).toBeTruthy();
        expect(screen.getByText('Tenant user ID')).toBeTruthy();
        expect(screen.getByText('42')).toBeTruthy();
        expect(screen.getByText('Repeated policy violation')).toBeTruthy();
        expect(within(screen.getByRole('region', { name: 'Latest status-audit' })).getByText(/Aug 30, 2026/)).toBeTruthy();
        expect(fetchAffiliates).toHaveBeenCalledTimes(1);
    });

    it('keeps a preserved historical audit visible when the enrollment is active again', async () => {
        fetchAffiliates.mockResolvedValueOnce([affiliate({ status: 'active' })]);
        renderPanel();

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Ari Affiliate' }));
        expect(await screen.findByText('Latest status-audit')).toBeTruthy();
        expect(screen.getByText('Active')).toBeTruthy();
        expect(screen.getByText('Code AF-ABC234')).toBeTruthy();
        expect(screen.queryByText(/Status: active/)).toBeNull();
        expect(screen.getByText('Repeated policy violation')).toBeTruthy();
    });

    it('uses explicit fallbacks for missing actor and reason', async () => {
        fetchAffiliates.mockResolvedValueOnce([affiliate({ revoked_by: null, revocation_reason: null })]);
        renderPanel();

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Ari Affiliate' }));
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

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Ari Affiliate' }));
        expect(within(await screen.findByRole('region', { name: 'Latest status-audit' })).getByText('Unknown time')).toBeTruthy();
    });

    it('preserves the existing empty-affiliates message', async () => {
        fetchAffiliates.mockResolvedValueOnce([]);
        renderPanel();

        expect(await screen.findByText('No affiliates enrolled yet.')).toBeTruthy();
        expect(screen.queryByText('Latest status-audit')).toBeNull();
    });

    it('loads disposable local preview fixtures without calling affiliate APIs', async () => {
        window.history.replaceState({}, '', '/?view=settings_affiliates&affiliate_preview=1#/terminal');
        renderPanel(manager);

        expect(await screen.findByText('John Doe')).toBeTruthy();
        expect(screen.getByText('Jane Smith')).toBeTruthy();
        expect(screen.getByText('Oliver Reyes')).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'Affiliates List' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('Jan 15, 2026')).toBeTruthy();
        expect(screen.queryByText('January 15, 2026')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Pending invites' })).toBeTruthy();
        expect(screen.getByText('preview.invite@example.com')).toBeTruthy();
        expect(screen.queryByText('No affiliates enrolled yet.')).toBeNull();
        const affiliateTable = screen.getByRole('table', { name: 'Affiliate list table' });
        expect(affiliateTable.className).toContain('table-fixed');
        expect(affiliateTable.className).toContain('text-left');
        expect(affiliateTable.className).toContain('w-full min-w-0');
        expect(affiliateTable.className).not.toContain('min-w-[1280px]');
        expect(affiliateTable.querySelectorAll('col').length).toBe(8);
        expect(Array.from(affiliateTable.querySelectorAll('col')).map((column) => column.className)).toEqual([
            'pos-affiliates-data-column pos-affiliates-identity-column', 'pos-affiliates-data-column pos-affiliates-status-column',
            'pos-affiliates-data-column pos-affiliates-rate-column', 'pos-affiliates-data-column pos-affiliates-amount-column',
            'pos-affiliates-data-column pos-affiliates-amount-column', 'pos-affiliates-data-column pos-affiliates-amount-column',
            'pos-affiliates-data-column pos-affiliates-joined-column', 'pos-affiliates-actions-column'
        ]);
        expect(affiliateTable.querySelectorAll('th.text-right, td.text-right').length).toBe(0);
        const affiliateListPanel = screen.getByRole('tabpanel', { name: 'Affiliates list' });
        expect(affiliateListPanel.className).toContain('overflow-hidden');
        const affiliateListScrollRegion = within(affiliateListPanel).getByTestId('affiliate-list-scroll-region');
        expect(affiliateListScrollRegion.className).toContain('overflow-y-auto');
        expect(affiliateListScrollRegion.className).toContain('affiliate-list-scroll-region');
        const affiliatePagination = within(affiliateListPanel).getByTestId('affiliate-list-pagination');
        const pendingInvites = within(affiliateListPanel).getByRole('heading', { name: 'Pending invites' });
        expect(affiliateListScrollRegion.contains(pendingInvites)).toBe(true);
        expect(affiliateListScrollRegion.contains(affiliatePagination)).toBe(true);
        expect(affiliatePagination.parentElement).not.toBe(affiliateListPanel);
        expect(affiliatePagination.parentElement?.className).toContain('flex min-w-0 shrink-0 flex-col gap-0');
        expect(affiliatePagination.className).not.toContain('border-t');
        expect(affiliatePagination.className).not.toContain('-mt-px');
        const affiliateTableRegion = within(affiliateListPanel).getByTestId('affiliate-table-region');
        expect(affiliateTableRegion.className).not.toContain('overflow-y-auto');
        expect(affiliateTableRegion.className).not.toContain('touch-pan-y');
        expect(affiliateTableRegion.parentElement?.className).toContain('shrink-0');
        expect(affiliateTableRegion.parentElement?.parentElement?.className).toContain('shrink-0');
        expect(affiliateTable.querySelectorAll('tbody > tr')).toHaveLength(8);
        const pendingInvitesSeparator = within(affiliateListPanel).getByTestId('affiliate-pending-invites-heading');
        expect(pendingInvitesSeparator.className).toContain('affiliate-pending-invites-heading');
        expect(pendingInvitesSeparator.className).toContain('border-t');
        expect(pendingInvitesSeparator.className).not.toContain('border-y');
        expect(pendingInvitesSeparator.className).toContain('py-4');
        expect(pendingInvitesSeparator.className).toContain('sm:py-5');
        expect(pendingInvitesSeparator.className).not.toContain('rounded-xl');
        expect(pendingInvitesSeparator.className).not.toContain('bg-white');
        expect(pendingInvitesSeparator.className).not.toContain('shadow');
        expect(pendingInvitesSeparator.contains(pendingInvites)).toBe(true);
        expect(pendingInvitesSeparator.nextElementSibling?.className).not.toContain('mt-2');
        const pendingInvitesRegion = within(affiliateListPanel).getByTestId('affiliate-pending-invites-region');
        expect(pendingInvitesRegion.className).not.toContain('overflow-y-auto');
        expect(pendingInvitesRegion.className).not.toContain('touch-pan-y');
        const pendingInvitesTable = within(pendingInvitesRegion).getByRole('table', { name: 'Pending affiliate invites table' });
        expect(pendingInvitesTable.className).toContain('table-fixed');
        expect(pendingInvitesTable.className).toContain('text-[13px]');
        expect(Array.from(pendingInvitesTable.querySelectorAll('col')).map((column) => column.className)).toEqual([
            'pos-affiliates-data-column pos-affiliates-identity-column', 'pos-affiliates-data-column', 'pos-affiliates-data-column', 'pos-affiliates-data-column',
            'pos-affiliates-data-column', 'pos-affiliates-data-column', 'pos-affiliates-data-column', 'pos-affiliates-actions-column'
        ]);
        expect(pendingInvitesTable.querySelectorAll('thead th')).toHaveLength(4);
        expect(pendingInvitesTable.querySelector('thead th[colspan="4"]')?.textContent).toBe('Email');
        expect(pendingInvitesTable.querySelector('tbody td[colspan="4"]')?.textContent).toContain('preview.invite@example.com');
        expect(pendingInvitesTable.querySelectorAll('tbody > tr')).toHaveLength(5);
        expect(within(pendingInvitesTable).getByText('Feb 20, 2026')).toBeTruthy();
        const pendingInvitesPagination = within(affiliateListPanel).getByTestId('affiliate-pending-invites-pagination');
        expect(pendingInvitesPagination.parentElement?.className).toContain('min-w-0 max-w-full');
        const cancelInviteButton = screen.getByRole('button', { name: 'Cancel invite preview.invite@example.com' });
        expect(cancelInviteButton).toBeTruthy();
        expect(cancelInviteButton.textContent).toBe('');
        expect(cancelInviteButton.className).toContain('h-9 w-9');
        expect(affiliateTable.querySelector('tbody td').className).toContain('px-2.5 py-2');
        expect(affiliateTable.querySelector('tbody td').className).toContain('leading-4');
        const firstRowCells = affiliateTable.querySelectorAll('tbody tr:first-child td');
        expect(Array.from(firstRowCells[0].querySelectorAll('div')).map((element) => element.className).join(' ')).toContain('text-[13px]');
        const firstRowEmail = Array.from(firstRowCells[0].querySelectorAll('div')).find((element) => element.className.includes('text-slate-400') && element.className.includes('text-[13px]'));
        expect(firstRowEmail?.className).toContain('whitespace-nowrap');
        expect(firstRowCells[1].querySelector('span')?.className).toContain('text-[13px]');
        expect(fetchAffiliateSettings).not.toHaveBeenCalled();
        expect(fetchAffiliates).not.toHaveBeenCalled();
        expect(fetchAffiliateCashouts).not.toHaveBeenCalled();
        expect(fetchAffiliateInvites).not.toHaveBeenCalled();
        expect(fetchAffiliatePriceRules).not.toHaveBeenCalled();
    });

    it('uses each table pagination to control its own rendered rows', async () => {
        const manyAffiliates = Array.from({ length: 25 }, (_, index) => affiliate({
            enrollment_id: 200 + index,
            short_code: `AF-MANY${String(index).padStart(3, '0')}`,
            dgfyAccount: {
                first_name: `Affiliate ${index + 1}`,
                last_name: 'Test',
                email: `affiliate-${index + 1}@example.com`
            }
        }));
        const manyInvites = Array.from({ length: 25 }, (_, index) => ({
            invite_id: 300 + index,
            email: `invite-${index + 1}@example.com`,
            status: 'pending',
            created_at: '2026-03-20T08:00:00.000Z'
        }));
        const manyCashouts = manyAffiliates.map((record, index) => ({
            cashout_id: 400 + index,
            enrollment_id: record.enrollment_id,
            status: 'requested',
            amount_centavos: 10000,
            requested_at: '2026-03-20T08:00:00.000Z',
            payout_snapshot: { method_type: 'gcash', mobile_number: '09171234567' },
            external_payment_ref: null,
            rejection_reason: null,
            enrollment: {
                enrollment_id: record.enrollment_id,
                dgfyAccount: { ...record.dgfyAccount }
            }
        }));
        fetchAffiliates.mockResolvedValueOnce(manyAffiliates);
        fetchAffiliateInvites.mockResolvedValueOnce(manyInvites);
        fetchAffiliateCashouts.mockResolvedValueOnce(manyCashouts);

        renderPanel({ permissions: [...manager.permissions, 'affiliates:cashout_approve', 'affiliates:cashout_pay'] });

        const listPanel = await screen.findByRole('tabpanel', { name: 'Affiliates list' });
        const affiliateTable = within(listPanel).getByRole('table', { name: 'Affiliate list table' });
        expect(affiliateTable.querySelectorAll('tbody > tr')).toHaveLength(20);
        expect(within(listPanel).getByText('Showing 1–20 of 25 entries')).toBeTruthy();

        fireEvent.click(within(listPanel).getByRole('button', { name: 'Items per page' }));
        fireEvent.click(within(listPanel).getByTestId('affiliate-list-pagination-page-size-option-40'));
        expect(affiliateTable.querySelectorAll('tbody > tr')).toHaveLength(25);
        expect(within(listPanel).getByText('Showing 1–25 of 25 entries')).toBeTruthy();

        const pendingInvitesTable = within(listPanel)
            .getByRole('table', { name: 'Pending affiliate invites table' });
        expect(pendingInvitesTable.querySelectorAll('tbody > tr')).toHaveLength(20);
        fireEvent.click(within(listPanel).getByRole('button', { name: 'Invites per page' }));
        fireEvent.click(within(listPanel).getByTestId('affiliate-pending-invites-pagination-page-size-option-40'));
        expect(pendingInvitesTable.querySelectorAll('tbody > tr')).toHaveLength(25);

        fireEvent.click(screen.getByRole('tab', { name: 'Cashout' }));
        const cashoutPanel = await screen.findByRole('tabpanel', { name: 'Affiliate cashout' });
        const cashoutTable = within(cashoutPanel).getByRole('table', { name: 'Affiliate cashout table' });
        expect(cashoutTable.querySelectorAll('tbody > tr')).toHaveLength(20);
        fireEvent.click(within(cashoutPanel).getByRole('button', { name: 'Items per page' }));
        fireEvent.click(within(cashoutPanel).getByTestId('affiliate-cashout-pagination-page-size-option-40'));
        expect(cashoutTable.querySelectorAll('tbody > tr')).toHaveLength(25);
    });

    it('uses readable record cards for the affiliate tables on mobile', async () => {
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn((query) => ({
            matches: query.includes('max-width: 767px'),
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn()
        }));

        try {
            window.history.replaceState({}, '', '/?view=settings_affiliates&affiliate_preview=1#/terminal');
            renderPanel({ permissions: [...manager.permissions, 'affiliates:cashout_approve'] });

            const listPanel = await screen.findByRole('tabpanel', { name: 'Affiliates list' });
            const mobileAffiliateRecords = within(listPanel).getByTestId('affiliate-mobile-records');
            expect(mobileAffiliateRecords).toBeTruthy();
            expect(mobileAffiliateRecords.querySelectorAll('article')).toHaveLength(8);
            expect(within(listPanel).queryByRole('table', { name: 'Affiliate list table' })).toBeNull();
            expect(within(mobileAffiliateRecords).getAllByText('Email')).toHaveLength(8);
            const mobilePendingInvites = within(listPanel).getByTestId('affiliate-pending-invites-mobile-records');
            expect(mobilePendingInvites.querySelectorAll('article')).toHaveLength(5);
            expect(within(listPanel).queryByRole('table', { name: 'Pending affiliate invites table' })).toBeNull();
            expect(within(mobilePendingInvites).getAllByText('Date invited')).toHaveLength(5);

            const firstDetailsToggle = within(mobileAffiliateRecords).getByRole('button', { name: 'Show details for John Doe' });
            const firstDetails = mobileAffiliateRecords.querySelector('[aria-label="Additional details for John Doe"]');
            expect(firstDetails).toBeTruthy();
            expect(firstDetails.hidden).toBe(true);
            fireEvent.click(firstDetailsToggle);
            expect(firstDetails.hidden).toBe(false);
            expect(within(mobileAffiliateRecords).getByRole('button', { name: 'Hide details for John Doe' })).toBeTruthy();

            fireEvent.click(screen.getByRole('tab', { name: 'Cashout' }));
            const cashoutPanel = await screen.findByRole('tabpanel', { name: 'Affiliate cashout' });
            expect(within(cashoutPanel).getByTestId('affiliate-cashout-mobile-records')).toBeTruthy();
            expect(within(cashoutPanel).getByTestId('affiliate-cashout-mobile-records').querySelectorAll('article')).toHaveLength(4);
            expect(within(cashoutPanel).queryByRole('table', { name: 'Affiliate cashout table' })).toBeNull();
        } finally {
            window.matchMedia = originalMatchMedia;
        }
    });

    it('keeps the Cashout actions dialog aligned with the Invite Affiliate modal', async () => {
        window.history.replaceState({}, '', '/?view=settings_affiliates&affiliate_preview=1#/terminal');
        renderPanel({ permissions: [...manager.permissions, 'affiliates:cashout_approve', 'affiliates:cashout_pay'] });

        fireEvent.click(await screen.findByRole('tab', { name: 'Cashout' }));
        const cashoutPanel = await screen.findByRole('tabpanel', { name: 'Affiliate cashout' });
        fireEvent.click(within(cashoutPanel).getByRole('button', { name: 'Actions for John Doe' }));

        const dialog = await screen.findByTestId('affiliate-cashout-actions-dialog');
        expect(dialog.className).toContain('affiliate-cashout-dialog');
        expect(dialog.className).toContain('max-w-lg');
        expect(screen.getByRole('heading', { name: 'Cashout actions' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Close cashout actions dialog' })).toBeTruthy();
        expect(screen.getByText('GCash')).toBeTruthy();
        expect(screen.getByText('09171234567')).toBeTruthy();

        const rejectionInput = screen.getByPlaceholderText('Rejection reason (optional)');
        expect(rejectionInput.className).toContain('h-10');
        expect(rejectionInput.className).toContain('bg-white');
        expect(screen.getByText('Rejection reason', { exact: false })).toBeTruthy();
        expect(screen.getByText('Provide context if you are denying this payout request.')).toBeTruthy();

        const footer = dialog.querySelector('.affiliate-cashout-dialog-footer');
        expect(footer).toBeTruthy();
        expect(footer.querySelector('.grid-cols-2')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Reject' }).className).toContain('h-10');
        expect(screen.getByRole('button', { name: 'Approve' }).className).toContain('h-10');
    });

    it('keeps pending invites with the list and gives Settings the full workspace', async () => {
        window.history.replaceState({}, '', '/?view=settings_affiliates&affiliate_preview=1#/terminal');
        renderPanel(manager);

        expect(await screen.findByText('preview.invite@example.com')).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));

        const settingsPanel = await screen.findByRole('tabpanel', { name: 'Affiliate settings' });
        expect(settingsPanel.className).toContain('flex min-h-0 min-w-0 max-w-full flex-1 flex-col');
        expect(screen.getByRole('heading', { name: 'Affiliate Settings' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Program Settings' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Selling Price' })).toBeTruthy();
        expect(screen.getByText('Estimated transaction breakdown')).toBeTruthy();
        expect(screen.getByText('Changes apply immediately to active affiliate links.')).toBeTruthy();
        expect(screen.getAllByRole('button', { name: 'Save Settings' })).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'Save Selling Price' })).toBeNull();
        expect(screen.queryByText('Review enrolled affiliates and their current status.')).toBeNull();
        expect(screen.queryByText('preview.invite@example.com')).toBeNull();
    });

    it('resets all Affiliate Settings drafts, including the preview base price', async () => {
        window.history.replaceState({}, '', '/?view=settings_affiliates&affiliate_preview=1#/terminal');
        renderPanel(manager);

        fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));

        const defaultRate = await screen.findByLabelText('Default commission rate (%)');
        const minimumCashout = await screen.findByLabelText('Minimum cashout (₱)');
        const previewBasePrice = await screen.findByLabelText('Preview using Base (₱)');
        fireEvent.change(defaultRate, { target: { value: '9' } });
        fireEvent.change(minimumCashout, { target: { value: '350' } });
        fireEvent.change(previewBasePrice, { target: { value: '250' } });

        expect(defaultRate.value).toBe('9');
        expect(minimumCashout.value).toBe('350');
        expect(previewBasePrice.value).toBe('250');

        const resetButton = screen.getByRole('button', { name: 'Reset All' });
        expect(resetButton.className).toContain('rounded-lg');
        expect(resetButton.className).toContain('border-rose-300');
        fireEvent.click(resetButton);

        expect(defaultRate.value).toBe('5');
        expect(minimumCashout.value).toBe('200');
        expect(previewBasePrice.value).toBe('100');
    });

    it('groups affiliate modal controls and provides a clear close action', async () => {
        window.history.replaceState({}, '', '/?view=settings_affiliates&affiliate_preview=1#/terminal');
        renderPanel(manager);

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for John Doe' }));

        const dialog = await screen.findByTestId('affiliate-actions-dialog');
        expect(dialog.className).toContain('max-w-lg');
        expect(screen.getByRole('heading', { name: 'Commission rate' })).toBeTruthy();
        expect(screen.getByLabelText('Affiliate controls')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Save rate' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Share Link' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Suspend' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Set price override' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Close affiliate actions dialog' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Close affiliate actions dialog' }));
        expect(screen.queryByTestId('affiliate-actions-dialog')).toBeNull();
    });

    it('keeps pending enrollment controls aligned with the affiliate lifecycle', async () => {
        window.history.replaceState({}, '', '/?view=settings_affiliates&affiliate_preview=1#/terminal');
        renderPanel(manager);

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for David Reyes' }));

        expect(screen.getByRole('button', { name: 'Save rate' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Set price override' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Share Link' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull();
        expect(screen.getByText('Share link becomes available after this affiliate is active.')).toBeTruthy();
    });

    it('offers reactivation for both suspended and revoked enrollments', async () => {
        window.history.replaceState({}, '', '/?view=settings_affiliates&affiliate_preview=1#/terminal');
        renderPanel(manager);

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Lena Chen' }));
        expect(screen.getByRole('button', { name: 'Reactivate' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Share Link' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Close affiliate actions dialog' }));
        fireEvent.click(screen.getByRole('button', { name: 'Actions for Mark Villafuerte' }));
        expect(screen.getByRole('button', { name: 'Reactivate' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Share Link' })).toBeNull();
    });
});

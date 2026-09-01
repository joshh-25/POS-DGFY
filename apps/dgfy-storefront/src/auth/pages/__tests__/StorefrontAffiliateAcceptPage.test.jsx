// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

const {
  acceptAffiliateInviteMock,
  fetchAffiliateInvitePreviewMock,
  fetchDgfyMeMock,
  getStoredDgfyTokenMock,
  navigateMock
} = vi.hoisted(() => ({
  acceptAffiliateInviteMock: vi.fn(),
  fetchAffiliateInvitePreviewMock: vi.fn(),
  fetchDgfyMeMock: vi.fn(),
  getStoredDgfyTokenMock: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock('../../../../../../packages/web-core/src/services/dgfyAuthService.js', () => ({
  acceptAffiliateInvite: acceptAffiliateInviteMock,
  fetchAffiliateInvitePreview: fetchAffiliateInvitePreviewMock,
  fetchDgfyMe: fetchDgfyMeMock,
  getStoredDgfyToken: getStoredDgfyTokenMock
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const preview = { valid: true, business_name: 'Acme Store', email: 'invitee@example.test' };

async function renderPage(path = '/affiliate/accept?token=abc123') {
  const StorefrontAffiliateAcceptPage = (await import('../StorefrontAffiliateAcceptPage.jsx')).default;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StorefrontAffiliateAcceptPage />
    </MemoryRouter>
  );
}

describe('StorefrontAffiliateAcceptPage', () => {
  beforeEach(() => {
    acceptAffiliateInviteMock.mockReset();
    fetchAffiliateInvitePreviewMock.mockReset();
    fetchDgfyMeMock.mockReset();
    getStoredDgfyTokenMock.mockReset();
    getStoredDgfyTokenMock.mockReturnValue('');
    navigateMock.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    fetchAffiliateInvitePreviewMock.mockResolvedValue(preview);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the Accept button for a verified cookie-only session (no stored token)', async () => {
    fetchDgfyMeMock.mockResolvedValueOnce({ account: { id: 'acct-1' } });

    await act(async () => { await renderPage(); });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Accept & become an affiliate' })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Sign in to accept' })).toBeNull();
  });

  it('calls acceptAffiliateInvite exactly once, including on a rapid double-click', async () => {
    fetchDgfyMeMock.mockResolvedValueOnce({ account: { id: 'acct-1' } });
    let resolveAccept;
    acceptAffiliateInviteMock.mockReturnValueOnce(new Promise((resolve) => { resolveAccept = resolve; }));

    await act(async () => { await renderPage(); });

    const button = await screen.findByRole('button', { name: 'Accept & become an affiliate' });
    const user = userEvent.setup();
    await user.click(button);
    await user.click(button);

    expect(acceptAffiliateInviteMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolveAccept({}); });
  });

  it('renders "Sign in to accept" for a signed-out visitor (fetchDgfyMe rejects)', async () => {
    fetchDgfyMeMock.mockRejectedValueOnce(new Error('unauthenticated'));

    await act(async () => { await renderPage(); });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in to accept' })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Accept & become an affiliate' })).toBeNull();
  });

  it('preserves the full query string (not just token) in the login return_to', async () => {
    fetchDgfyMeMock.mockRejectedValueOnce(new Error('unauthenticated'));

    await act(async () => {
      await renderPage('/affiliate/accept?token=abc123&utm_source=email&ref=xyz');
    });

    const button = await screen.findByRole('button', { name: 'Sign in to accept' });
    const user = userEvent.setup();
    await user.click(button);

    const expectedReturnTo = encodeURIComponent('/affiliate/accept?token=abc123&utm_source=email&ref=xyz');
    expect(navigateMock).toHaveBeenCalledWith(`/login?return_to=${expectedReturnTo}`);
  });

  it('calls fetchAffiliateInvitePreview exactly once per token, even across a re-render', async () => {
    fetchDgfyMeMock.mockResolvedValueOnce({ account: { id: 'acct-1' } });

    const { rerender } = await renderPage();
    await waitFor(() => expect(fetchAffiliateInvitePreviewMock).toHaveBeenCalledTimes(1));

    const StorefrontAffiliateAcceptPage = (await import('../StorefrontAffiliateAcceptPage.jsx')).default;
    await act(async () => {
      rerender(
        <MemoryRouter initialEntries={['/affiliate/accept?token=abc123']}>
          <StorefrontAffiliateAcceptPage />
        </MemoryRouter>
      );
    });

    expect(fetchAffiliateInvitePreviewMock).toHaveBeenCalledTimes(1);
  });
});

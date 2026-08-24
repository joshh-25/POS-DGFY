import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  acceptAffiliateInvite,
  fetchAffiliateInvitePreview,
  getStoredDgfyToken
} from '../../../../../packages/web-core/src/services/dgfyAuthService.js';

// Explicit accept page for affiliate invitees who already have a DGFY account. The email link points
// here (/affiliate/accept?token=...). If the visitor isn't signed in we bounce them to /login with a
// return_to back to this page; once signed in they click Accept to create the enrollment.
export default function StorefrontAffiliateAcceptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  const isAuthenticated = useMemo(() => Boolean(String(getStoredDgfyToken() || '').trim()), []);
  const loginHref = useMemo(() => {
    const returnTo = `/affiliate/accept?token=${encodeURIComponent(token)}`;
    return `/login?return_to=${encodeURIComponent(returnTo)}`;
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError('This invitation link is missing its token.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchAffiliateInvitePreview(token)
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch(() => { if (!cancelled) setError('This invitation is invalid or has been removed.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptAffiliateInvite(token);
      setAccepted(true);
      toast.success('You are now an affiliate!');
    } catch (err) {
      const message = err?.response?.data?.message || 'Could not accept this invitation.';
      setError(message);
      toast.error(message);
    } finally {
      setAccepting(false);
    }
  };

  const businessName = preview?.business_name || 'a DGFY store';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#0F172A' }}>
          Affiliate invitation
        </h1>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading your invitation…</p>
        ) : accepted ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              You&apos;re now an affiliate of <strong>{businessName}</strong>. Share your link to start
              earning commissions.
            </div>
            <Link
              to="/"
              className="block w-full rounded-xl py-3 text-center text-sm font-bold text-white"
              style={{ background: '#1A4E8D' }}
            >
              Go to your account
            </Link>
          </div>
        ) : error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : preview && !preview.valid ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This invitation is no longer valid{preview.expired ? ' (it has expired)' : ''}. Please ask
            the store to send you a new one.
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <p className="text-sm text-slate-600">
              You&apos;ve been invited to become an affiliate of <strong>{businessName}</strong> and earn
              commissions on the sales you refer.
            </p>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#1A4E8D', border: 'none', cursor: accepting ? 'not-allowed' : 'pointer' }}
              >
                {accepting ? 'Accepting…' : `Accept & become an affiliate`}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Sign in with the DGFY account for <strong>{preview?.email || 'your invited email'}</strong> to accept.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(loginHref)}
                  className="w-full rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#1A4E8D', border: 'none', cursor: 'pointer' }}
                >
                  Sign in to accept
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

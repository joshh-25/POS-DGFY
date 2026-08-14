import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { requestDgfyPasswordReset, completeDgfyPasswordReset } from '../../../packages/web-core/src/services/dgfyAuthService.js';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import DgfyAuthHero from '../../../packages/web-core/src/features/dgfy/components/DgfyAuthHero.jsx';
import DgfyPasswordInput from '../../../packages/web-core/src/features/dgfy/components/DgfyPasswordInput.jsx';
import dgfyLogo from '../../../packages/web-core/src/assets/dgfy/dgfy-logo.png';
import {
  buildDgfyAuthPath,
  readDgfyRouteParams,
  resolveStorefrontHomeUrl
} from '../../../packages/web-core/src/features/dgfyRouteHelpers.js';

const storefrontHomeUrl = resolveStorefrontHomeUrl();

function FieldGroup({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold" style={{ color: '#0F172A' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: '#1A4E8D', height: 48, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
    </button>
  );
}

const inputClass = 'h-12 rounded-xl border-[#CBD5E1] bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20';

export default function DgfyResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeParams = readDgfyRouteParams(searchParams);
  const [resetForm, setResetForm] = useState({
    email: routeParams.email || '',
    code: '',
    password: '',
    confirmPassword: ''
  });
  const [resetStep, setResetStep] = useState('request');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestPasswordReset = async (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    setIsLoading(true);
    try {
      await requestDgfyPasswordReset(resetForm.email);
      setResetStep('complete');
      toast.success('Reset code sent to email');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Could not request password reset.');
    } finally { setIsLoading(false); }
  };

  const handleCompletePasswordReset = async (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (resetForm.password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (resetForm.password !== resetForm.confirmPassword) { toast.error('Passwords do not match.'); return; }
    setIsLoading(true);
    try {
      await completeDgfyPasswordReset({
        email: resetForm.email,
        code: resetForm.code,
        password: resetForm.password,
        confirm_password: resetForm.confirmPassword
      });
      toast.success('Password reset successfully');
      navigate(buildDgfyAuthPath({ intent: routeParams.intent, mode: 'sign-in', returnTo: routeParams.returnTo, email: resetForm.email }), {
        replace: true,
        state: { notice: 'Password reset complete. Sign in with your new password.' }
      });
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Password reset failed.');
    } finally { setIsLoading(false); }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1920px]">

      {/* ── LEFT: Hero panel — hidden on mobile ─────────────── */}
      <div className="hidden lg:flex lg:w-[45%]">
        <DgfyAuthHero />
      </div>

      {/* ── RIGHT: Form panel ───────────────────────────────── */}
      <div className="flex flex-1 flex-col justify-center overflow-y-auto bg-white" style={{ minHeight: '100vh' }}>
        <div className="mx-auto w-full max-w-[480px] px-6 py-8 sm:px-8 sm:py-12">

          {/* Mobile: compact logo */}
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <a href={storefrontHomeUrl} aria-label="Back to DGFY storefront">
              <img src={dgfyLogo} alt="DGFY Logo" className="h-10 w-auto object-contain" />
            </a>
          </div>

          {/* Step success indicator */}
          {resetStep === 'complete' && (
            <div className="mb-5 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
              style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Reset code sent — check your email.
            </div>
          )}

          {/* Error / Notice */}
          {error && (
            <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
              {error}
            </div>
          )}

          <div className="flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#0F172A' }}>Forgot Password</h1>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#64748B' }}>
                {resetStep === 'request'
                  ? "Enter your email address and we'll send you a password reset link."
                  : 'Enter the 6-digit code from your email and choose a new password.'}
              </p>
            </div>

            <form
              onSubmit={resetStep === 'request' ? handleRequestPasswordReset : handleCompletePasswordReset}
              className="flex flex-col gap-4"
            >
              <FieldGroup id="dgfyResetEmail" label="Email Address">
                <Input
                  id="dgfyResetEmail"
                  type="email"
                  placeholder="name@company.com"
                  value={resetForm.email}
                  onChange={(e) => setResetForm((c) => ({ ...c, email: e.target.value }))}
                  required
                  disabled={isLoading || resetStep === 'complete'}
                  className={inputClass}
                />
              </FieldGroup>

              {resetStep === 'complete' && (
                <>
                  <FieldGroup id="dgfyResetCode" label="Reset Code">
                    <Input
                      id="dgfyResetCode"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="XXXXXX"
                      value={resetForm.code}
                      onChange={(e) => setResetForm((c) => ({ ...c, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      required
                      disabled={isLoading}
                      className={inputClass}
                    />
                  </FieldGroup>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldGroup id="dgfyResetPassword" label="New Password">
                      <DgfyPasswordInput id="dgfyResetPassword" autoComplete="new-password" placeholder="••••••••"
                        value={resetForm.password} onChange={(e) => setResetForm((c) => ({ ...c, password: e.target.value }))} disabled={isLoading} />
                    </FieldGroup>
                    <FieldGroup id="dgfyResetConfirmPassword" label="Confirm New Password">
                      <DgfyPasswordInput id="dgfyResetConfirmPassword" autoComplete="new-password" placeholder="••••••••"
                        value={resetForm.confirmPassword} onChange={(e) => setResetForm((c) => ({ ...c, confirmPassword: e.target.value }))} disabled={isLoading} />
                    </FieldGroup>
                  </div>
                </>
              )}

              <div className="mt-4">
                <PrimaryBtn disabled={isLoading}>
                  {isLoading ? 'Working…' : resetStep === 'request' ? 'Send Reset Link' : 'Reset Password'}
                </PrimaryBtn>
              </div>
            </form>

            <p className="text-center text-sm" style={{ color: '#64748B' }}>
              <Link
                to={buildDgfyAuthPath({ intent: routeParams.intent, mode: 'sign-in', returnTo: routeParams.returnTo, email: resetForm.email })}
                className="font-semibold hover:underline"
                style={{ color: '#1A4E8D' }}
              >
                Back to Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

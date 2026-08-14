import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../../../packages/web-core/src/services/api.js';
import { setBrowserSession } from '../../../packages/web-core/src/services/browserSession.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Mail, Loader2, AlertCircle, UserPlus, Shield, Wand2 } from 'lucide-react';
import { getPhoneNumberError, normalizePhoneNumber, PHONE_NUMBER_HELP_TEXT } from '../../../packages/web-core/src/utils/phoneNumber.js';
import { generateReadablePassword, isPasswordLongEnough } from '../../../packages/web-core/src/utils/passwordPolicy.js';

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get token from URL query param
  const tokenFromUrl = searchParams.get('token') || '';
  const [formData, setFormData] = useState({
    username: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    emailOtpCode: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSentAt, setOtpSentAt] = useState(null);
  const [passwordFocus, setPasswordFocus] = useState(false);

  // Token validation state
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [invitationData, setInvitationData] = useState(null);
  const [tokenError, setTokenError] = useState('');

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!tokenFromUrl) {
        setTokenValid(false);
        setTokenError('No invitation token provided. Please use the link from your invitation email.');
        setIsValidatingToken(false);
        return;
      }

      setIsValidatingToken(true);
      setTokenError('');

      try {
        const response = await api.get(`/auth/validate-invite/${tokenFromUrl}`);
        setInvitationData(response.data.data);
        setTokenValid(true);
      } catch (err) {
        setTokenValid(false);
        setInvitationData(null);
        if (err.response?.status === 400) {
          setTokenError(err.response.data.message || 'Invalid or expired invitation');
        } else {
          setTokenError('Could not validate invitation. Please try again later.');
        }
      } finally {
        setIsValidatingToken(false);
      }
    };

    validateToken();
  }, [tokenFromUrl]);

  // Password validation rules
  const passwordValidations = {
    minLength: isPasswordLongEnough(formData.password)
  };

  const isPasswordValid = Object.values(passwordValidations).every(v => v);
  const passwordsMatch = formData.password === formData.confirmPassword;
  const isEmailOtpValid = /^\d{6}$/.test(String(formData.emailOtpCode || '').trim());

  const handleRequestEmailOtp = async () => {
    setError('');
    if (!tokenFromUrl) {
      setError('Invitation token is required before requesting a verification code');
      return;
    }

    setIsSendingOtp(true);
    try {
      await api.post('/auth/email-otp/request', {
        purpose: 'invitation_acceptance',
        invitation_token: tokenFromUrl
      });
      setOtpSentAt(new Date());
      setFormData((current) => ({ ...current, emailOtpCode: '' }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send verification code. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (!isPasswordValid) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!isEmailOtpValid) {
      setError('Enter the 6-digit verification code sent to your invited email');
      return;
    }

    const phoneNumberError = getPhoneNumberError(formData.phoneNumber);
    if (phoneNumberError) {
      setError(phoneNumberError);
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.post('/auth/accept-invite', {
        token: tokenFromUrl,
        username: formData.username,
        phone_number: normalizePhoneNumber(formData.phoneNumber),
        password: formData.password,
        email_otp_code: String(formData.emailOtpCode || '').trim()
      });

      const data = response.data?.data || {};
      const resolvedCompanyToken = data.company?.token || null;
      setBrowserSession({ token: data.token, companyToken: resolvedCompanyToken });
      window.dispatchEvent(new CustomEvent('auth:login'));
      navigate('/');
    } catch (err) {
      const errorMessage = err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.message ||
        'Failed to create account. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const ValidationItem = ({ valid, text }) => (
    <div className="flex items-center gap-2 text-xs">
      {valid ? (
        <CheckCircle2 className="w-3 h-3 text-green-600" />
      ) : (
        <XCircle className="w-3 h-3 text-slate-400" />
      )}
      <span className={valid ? 'text-green-700' : 'text-slate-600'}>
        {text}
      </span>
    </div>
  );

  const handleGeneratePassword = () => {
    const generatedPassword = generateReadablePassword();
    setFormData((current) => ({
      ...current,
      password: generatedPassword,
      confirmPassword: generatedPassword
    }));
    setPasswordFocus(true);
  };

  // Role badge color
  const getRoleBadgeClass = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'manager':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const formatExpiry = (date) => {
    if (!date) return 'Not provided';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Loading state
  if (isValidatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-slate-600">Validating invitation...</p>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Invitation</h1>
            <p className="text-slate-600 mb-6">{tokenError}</p>
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                If you believe this is an error, please contact your administrator
                to request a new invitation.
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Go to Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-teal-600 rounded-lg flex items-center justify-center">
                <UserPlus className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Accept Invitation</h1>
            <p className="text-slate-600 mt-2">Complete your account setup</p>
          </div>

          {/* Invitation Info */}
          {invitationData && (
            <div className="mb-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-teal-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-teal-900">
                    You've been invited to join
                  </p>
                  <p className="text-lg font-semibold text-teal-700">
                    {invitationData.tenantName || 'the team'}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600">Role:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeClass(invitationData.role)}`}>
                      {invitationData.role?.charAt(0).toUpperCase() + invitationData.role?.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Email: {invitationData.email}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Invited by: {invitationData.inviter_name || 'Your administrator'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Expires: {formatExpiry(invitationData.expires_at)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="username">Choose a Username</Label>
                <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="john_doe"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                minLength={3}
                maxLength={50}
                disabled={isLoading}
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">3-50 characters</p>
            </div>

            <div>
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                autoComplete="tel"
                placeholder="+63 912 345 6789"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                required
                disabled={isLoading}
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-slate-500">{PHONE_NUMBER_HELP_TEXT}</p>
              </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Create Password</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGeneratePassword}
                  disabled={isLoading}
                  className="h-8 gap-1.5"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Generate
                </Button>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onFocus={() => setPasswordFocus(true)}
                required
                disabled={isLoading}
                className="mt-1"
              />

              {/* Password Requirements */}
              {(passwordFocus || formData.password) && (
                <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-1">
                  <p className="text-xs font-semibold text-slate-700 mb-1">Password Requirements:</p>
                  <ValidationItem valid={passwordValidations.minLength} text="At least 8 characters" />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                disabled={isLoading}
                className="mt-1"
              />
              {formData.confirmPassword && (
                <p className={`text-xs mt-1 ${passwordsMatch ? 'text-green-600' : 'text-red-600'}`}>
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="emailOtpCode">Email Verification Code</Label>
                  <Input
                    id="emailOtpCode"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="123456"
                    value={formData.emailOtpCode}
                    onChange={(e) => setFormData({ ...formData, emailOtpCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    required
                    disabled={isLoading}
                    className="mt-1"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleRequestEmailOtp}
                  disabled={isLoading || isSendingOtp}
                >
                  {isSendingOtp ? 'Sending Code...' : otpSentAt ? 'Resend Code' : 'Send Code'}
                </Button>
                <p className="text-xs text-slate-500">
                  {otpSentAt
                    ? `Code sent to ${invitationData?.email || 'your invited email'}.`
                    : 'Send a code to the invited email before completing setup.'}
                </p>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700"
              disabled={isLoading || !isPasswordValid || !passwordsMatch || !isEmailOtpValid}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Complete Setup'
              )}
            </Button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="text-teal-600 hover:text-teal-700 font-medium">
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          SKUpervisor v1.0.0
        </p>
      </div>
    </div>
  );
}

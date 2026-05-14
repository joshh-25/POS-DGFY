import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../src/services/api.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Mail, Loader2, AlertCircle, UserPlus, Shield } from 'lucide-react';
import { getPhoneNumberError, normalizePhoneNumber, PHONE_NUMBER_HELP_TEXT } from '../src/utils/phoneNumber.js';

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get token from URL query param
  const tokenFromUrl = searchParams.get('token') || '';
  const companyTokenFromUrl =
    searchParams.get('company') ||
    searchParams.get('companyToken') ||
    '';

  const [formData, setFormData] = useState({
    username: '',
    phoneNumber: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
        const config = companyTokenFromUrl
          ? { headers: { 'x-company-token': companyTokenFromUrl } }
          : {};
        const response = await api.get(`/auth/validate-invite/${tokenFromUrl}`, config);
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
  }, [tokenFromUrl, companyTokenFromUrl]);

  // Password validation rules
  const passwordValidations = {
    minLength: formData.password.length >= 8,
    hasUppercase: /[A-Z]/.test(formData.password),
    hasLowercase: /[a-z]/.test(formData.password),
    hasNumber: /\d/.test(formData.password),
    hasSpecial: /[@$!%*?&]/.test(formData.password)
  };

  const isPasswordValid = Object.values(passwordValidations).every(v => v);
  const passwordsMatch = formData.password === formData.confirmPassword;

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
      setError('Password does not meet security requirements');
      return;
    }

    const phoneNumberError = getPhoneNumberError(formData.phoneNumber);
    if (phoneNumberError) {
      setError(phoneNumberError);
      return;
    }

    setIsLoading(true);

    try {
      const config = companyTokenFromUrl
        ? { headers: { 'x-company-token': companyTokenFromUrl } }
        : {};
      const response = await api.post('/auth/accept-invite', {
        token: tokenFromUrl,
        username: formData.username,
        phone_number: normalizePhoneNumber(formData.phoneNumber),
        password: formData.password
      }, config);

      const data = response.data?.data || {};
      if (data.token) localStorage.setItem('authToken', data.token);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      const resolvedCompanyToken = data.company?.token || companyTokenFromUrl;
      if (resolvedCompanyToken) localStorage.setItem('companyToken', resolvedCompanyToken);
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
              <Label htmlFor="password">Create Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Create a strong password"
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
                  <ValidationItem valid={passwordValidations.hasUppercase} text="One uppercase letter" />
                  <ValidationItem valid={passwordValidations.hasLowercase} text="One lowercase letter" />
                  <ValidationItem valid={passwordValidations.hasNumber} text="One number" />
                  <ValidationItem valid={passwordValidations.hasSpecial} text="One special character (@$!%*?&)" />
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

            <Button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700"
              disabled={isLoading || !isPasswordValid || !passwordsMatch}
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

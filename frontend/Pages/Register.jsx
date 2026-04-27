import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { register } from '../src/services/authService.js';
import api from '../src/services/api.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, CheckCircle2, XCircle, Building2, Loader2, AlertCircle } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get token from URL query param
  const tokenFromUrl = searchParams.get('token') || '';

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyToken: tokenFromUrl
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);

  // Token validation state
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [tokenError, setTokenError] = useState('');

  // Validate token when it changes
  useEffect(() => {
    const validateToken = async () => {
      if (!formData.companyToken) {
        setTokenValid(false);
        setCompanyName('');
        setTokenError('');
        return;
      }

      setIsValidatingToken(true);
      setTokenError('');

      try {
        const response = await api.get(`/auth/validate-token/${formData.companyToken}`);
        const tenantData = response?.data?.data || {};
        const resolvedStatus = String(tenantData?.status || '').trim().toLowerCase();

        if (resolvedStatus && resolvedStatus !== 'active') {
          setCompanyName(tenantData.company_name || '');
          setTokenValid(false);
          if (resolvedStatus === 'pending') {
            setTokenError('This company is pending approval. You can register users after activation.');
          } else if (resolvedStatus === 'rejected') {
            setTokenError('This company registration was rejected. Ask your company owner to re-submit registration.');
          } else if (resolvedStatus === 'inactive') {
            setTokenError('This company is inactive. Contact your administrator for reactivation.');
          } else {
            setTokenError('This company token is not currently eligible for user registration.');
          }
          return;
        }

        setCompanyName(tenantData.company_name);
        setTokenValid(true);
      } catch (err) {
        setTokenValid(false);
        setCompanyName('');
        if (err.response?.status === 404) {
          setTokenError('Invalid or expired company token');
        } else {
          setTokenError('Could not validate token');
        }
      } finally {
        setIsValidatingToken(false);
      }
    };

    // Debounce validation
    const timeoutId = setTimeout(validateToken, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.companyToken]);

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

    // Validate company token
    if (!formData.companyToken) {
      setError('Company token is required. Please get the token from your company administrator.');
      return;
    }

    if (!tokenValid) {
      setError('Please enter a valid company token');
      return;
    }

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

    setIsLoading(true);

    try {
      await register({
        username: formData.username,
        email: formData.email,
        password: formData.password
      }, formData.companyToken);

      // Redirect to login page
      navigate('/login?registered=true');
    } catch (err) {
      const errorMessage = err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.message ||
        'Registration failed. Please try again.';
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center">
                <Package className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Create Account</h1>
            <p className="text-slate-600 mt-2">Join SKUpervisor</p>
          </div>

          {/* Company Name Badge (when token is valid) */}
          {tokenValid && companyName && (
            <div className="mb-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                <div>
                  <p className="text-sm font-medium text-teal-900">Joining Company</p>
                  <p className="text-lg font-semibold text-teal-700">{companyName}</p>
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
            {/* Company Token Field */}
            <div>
              <Label htmlFor="companyToken">Company Token *</Label>
              <div className="relative">
                <Input
                  id="companyToken"
                  type="text"
                  autoComplete="off"
                  placeholder="e.g., token-company-abc123"
                  value={formData.companyToken}
                  onChange={(e) => setFormData({ ...formData, companyToken: e.target.value })}
                  required
                  disabled={isLoading}
                  className={`mt-1 pr-10 ${tokenValid ? 'border-green-500' : tokenError ? 'border-red-500' : ''}`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isValidatingToken && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  {!isValidatingToken && tokenValid && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {!isValidatingToken && tokenError && <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
              </div>
              {tokenError && (
                <p className="text-xs text-red-600 mt-1">{tokenError}</p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Get this token from your company administrator
              </p>
            </div>

            <div>
              <Label htmlFor="username">Username</Label>
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={isLoading}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
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
                  {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            {/* Info about default role */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-900">Account Type</p>
              <p className="text-xs text-blue-700 mt-1">
                New accounts are created as <span className="font-semibold">Staff</span> with basic access.
                Contact an administrator to request role changes.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !isPasswordValid || !passwordsMatch || !tokenValid}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
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

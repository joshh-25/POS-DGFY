import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../src/services/authService.js';
import api from '../src/services/api.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    companyToken: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // New state for email lookup
  const [showTokenField, setShowTokenField] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [availableTenants, setAvailableTenants] = useState([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Look up tenant by email when user finishes typing
  const handleEmailBlur = async () => {
    if (!formData.email || !formData.email.includes('@')) {
      return;
    }

    setIsLookingUp(true);
    setLookupError('');
    setAvailableTenants([]);

    try {
      const response = await api.post('/auth/lookup', { email: formData.email });
      const data = response.data.data;

      if (data.multiple) {
        // Multiple tenants - show selector
        setAvailableTenants(data.tenants);
        setShowTokenField(true);
        setFormData(prev => ({ ...prev, companyToken: '' }));
      } else {
        // Single tenant - auto-fill token
        setFormData(prev => ({ ...prev, companyToken: data.company_token }));
        setShowTokenField(false);
        setAvailableTenants([]);
      }
      setLookupDone(true);
    } catch (err) {
      if (err.response?.status === 404) {
        // Email not found - show manual token field
        setLookupError('Email not found. Enter your company token manually.');
        setShowTokenField(true);
        setFormData(prev => ({ ...prev, companyToken: '' }));
      } else {
        // Network or other error - allow manual entry
        setShowTokenField(true);
      }
      setLookupDone(true);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate company token is present
    if (!formData.companyToken) {
      setError('Company token is required. Please enter your company token.');
      setShowTokenField(true);
      return;
    }

    setIsLoading(true);

    try {
      await login({
        email: formData.email,
        password: formData.password,
        companyToken: formData.companyToken
      });

      // Get redirect path or default to dashboard
      const redirectPath = localStorage.getItem('redirectAfterLogin') || '/';
      localStorage.removeItem('redirectAfterLogin');

      navigate(redirectPath);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src="/logo.png" alt="SKUpervisor" className="h-16" />
            </div>
            <p className="text-slate-600 mt-2">Sign in to your account</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@test.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    // Reset lookup state when email changes
                    setLookupDone(false);
                    setLookupError('');
                  }}
                  onBlur={handleEmailBlur}
                  required
                  disabled={isLoading}
                  className="mt-1"
                />
                {isLookingUp && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  </div>
                )}
              </div>
              {lookupError && (
                <p className="text-xs text-amber-600 mt-1">{lookupError}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                disabled={isLoading}
                className="mt-1"
              />
            </div>

            {/* Company Token Field - Conditionally shown */}
            {showTokenField ? (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="companyToken">Company Token</Label>
                  <button
                    type="button"
                    onClick={() => setShowTokenField(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                  >
                    Hide <ChevronUp className="w-3 h-3" />
                  </button>
                </div>
                {availableTenants.length > 0 ? (
                  <Select
                    value={formData.companyToken}
                    onValueChange={(value) => setFormData({ ...formData, companyToken: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select your company" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.company_token}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="companyToken"
                    type="text"
                    placeholder="e.g., token-tenant-a"
                    value={formData.companyToken}
                    onChange={(e) => setFormData({ ...formData, companyToken: e.target.value })}
                    disabled={isLoading}
                    className="mt-1"
                  />
                )}
              </div>
            ) : (
              lookupDone && formData.companyToken && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Company identified automatically</span>
                  <button
                    type="button"
                    onClick={() => setShowTokenField(true)}
                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    Change <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              )
            )}

            {/* Show token field link if not looking up and no auto-resolve happened */}
            {!showTokenField && !lookupDone && (
              <button
                type="button"
                onClick={() => setShowTokenField(true)}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                Enter company token manually <ChevronDown className="w-3 h-3" />
              </button>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Registration Link */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-slate-600">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
                Create one here
              </Link>
            </p>
            <p className="text-sm text-slate-600">
              Need a new company?{' '}
              <Link to="/register-company" className="text-indigo-600 hover:text-indigo-700 font-medium">
                Register Company
              </Link>
            </p>
          </div>

          {/* Development Credentials Info */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-900 mb-2">Development Credentials:</p>
              <p className="text-xs text-blue-700">Email: admin@tenant-a.com</p>
              <p className="text-xs text-blue-700">Password: Admin123!</p>
              <p className="text-xs text-blue-700">Token: token-tenant-a</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          SKUpervisor v1.0.0
        </p>
      </div>
    </div>
  );
}

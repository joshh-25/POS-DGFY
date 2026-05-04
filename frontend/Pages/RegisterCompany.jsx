import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../src/services/api.js';
import { login } from '../src/services/authService.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, XCircle } from 'lucide-react';
import { WORKFLOW_MODE_LABELS, WORKFLOW_MODE_VALUES } from '../src/features/settings/workflowMode.js';

export default function RegisterCompany() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        companyName: '',
        adminEmail: '',
        adminPassword: '',
        confirmPassword: '',
        complianceMode: 'non_compliant',
        workflowMode: 'food_manufacturing'
    });

    const [error, setError] = useState('');
    const [success, setSuccess] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [autoLoginError, setAutoLoginError] = useState('');

    const passwordValidations = {
        minLength: formData.adminPassword.length >= 8,
        hasUppercase: /[A-Z]/.test(formData.adminPassword),
        hasLowercase: /[a-z]/.test(formData.adminPassword),
        hasNumber: /\d/.test(formData.adminPassword),
        hasSpecial: /[@$!%*?&]/.test(formData.adminPassword)
    };

    const isPasswordValid = Object.values(passwordValidations).every(Boolean);
    const passwordsMatch = formData.adminPassword === formData.confirmPassword;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(null);
        setAutoLoginError('');

        if (!passwordsMatch) {
            setError('Passwords do not match');
            return;
        }

        if (!isPasswordValid) {
            setError('Password does not meet security requirements');
            return;
        }

        setIsLoading(true);
        try {
            const registrationPassword = formData.adminPassword;
            const response = await api.post('/admin/tenants/register', {
                name: formData.companyName,
                adminEmail: formData.adminEmail,
                adminPassword: formData.adminPassword,
                plan: 'standard',
                complianceMode: formData.complianceMode,
                workflowMode: formData.workflowMode
            });

            if (response.data.success) {
                const registrationSuccess = {
                    status: response.data.data.status,
                    message: response.data.message,
                    company_token: response.data.data.company_token,
                    adminEmail: formData.adminEmail,
                    companyName: formData.companyName,
                    autoLoginFailed: false
                };

                if (registrationSuccess.status === 'active') {
                    try {
                        await login({
                            email: formData.adminEmail,
                            password: registrationPassword,
                            companyToken: registrationSuccess.company_token
                        });

                        const redirectPath = localStorage.getItem('redirectAfterLogin') || '/';
                        localStorage.removeItem('redirectAfterLogin');
                        navigate(redirectPath);
                        return;
                    } catch (loginError) {
                        setAutoLoginError(
                            loginError.response?.data?.message
                            || loginError.message
                            || 'Automatic sign-in failed. Sign in manually to continue.'
                        );
                        registrationSuccess.autoLoginFailed = true;
                    }
                }

                setSuccess(registrationSuccess);
                setFormData((current) => ({
                    ...current,
                    adminPassword: '',
                    confirmPassword: ''
                }));
            } else {
                setError(response.data.message || 'Registration failed');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const ValidationItem = ({ valid, text }) => (
        <div className="flex items-center gap-2 text-xs">
            {valid ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-slate-400" />}
            <span className={valid ? 'text-green-700' : 'text-slate-600'}>{text}</span>
        </div>
    );

    if (success) {
        const isActive = success.status === 'active';
        const activeManualFallback = isActive && success.autoLoginFailed;

        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                        <CheckCircle2 className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 mb-2">
                            {isActive ? 'Company Created!' : 'Request Submitted!'}
                        </h1>
                        <p className="text-slate-600 mb-6">{success.message}</p>
                        {autoLoginError && (
                            <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                                {autoLoginError}
                            </div>
                        )}

                        <div className="bg-blue-50 rounded-lg p-4 text-left mb-6">
                            <p className="text-sm font-semibold text-blue-800 mb-2">
                                {isActive ? (activeManualFallback ? 'Sign in manually' : 'Your login is ready') : 'What happens next?'}
                            </p>
                            {isActive ? (
                                <ul className="text-sm text-blue-700 space-y-1 mb-4">
                                    <li>- Your company was created successfully</li>
                                    <li>- Your company token will be filled in on the login page</li>
                                    <li>- Use your admin email and password to sign in</li>
                                </ul>
                            ) : (
                                <ul className="text-sm text-blue-700 space-y-1 mb-4">
                                    <li>- Our team will review your request</li>
                                    <li>- Subscription billing is currently disabled</li>
                                    <li>- You will receive login credentials via email once approved</li>
                                </ul>
                            )}
                            {success.company_token && (
                                <div className="pt-3 border-t border-blue-200">
                                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Your Company Token:</p>
                                    <div className="flex items-center justify-between bg-white border border-blue-200 rounded p-2">
                                        <code className="text-indigo-600 font-mono font-bold text-sm">{success.company_token}</code>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(success.company_token)}
                                            className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Button
                            onClick={() => navigate('/login', {
                                state: isActive
                                    ? {
                                        registration: {
                                            email: success.adminEmail,
                                            companyToken: success.company_token,
                                            companyName: success.companyName
                                        }
                                    }
                                    : undefined
                            })}
                            className="w-full"
                            variant={isActive ? 'default' : 'outline'}
                        >
                            {isActive ? 'Sign in manually' : 'Back to Login'}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
            <div className="w-full max-w-2xl">
                <div className="bg-white rounded-lg shadow-lg p-8">
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-4">
                            <div className="w-16 h-16 bg-indigo-600 rounded-lg flex items-center justify-center">
                                <Building2 className="w-10 h-10 text-white" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">Register Your Company</h1>
                        <p className="text-slate-600 mt-2">Create a new company account on SKUpervisor</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="p-4 border rounded-lg border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-slate-900">Standard</h3>
                                <Building2 className="w-5 h-5 text-slate-500" />
                            </div>
                            <p className="text-sm text-slate-600">Standard onboarding only</p>
                            <p className="text-xs text-slate-500 mt-1">Subscription billing is currently disabled.</p>
                        </div>

                        <div>
                            <Label htmlFor="complianceMode">Compliance Mode</Label>
                            <select
                                id="complianceMode"
                                value={formData.complianceMode}
                                onChange={(e) => setFormData({ ...formData, complianceMode: e.target.value })}
                                disabled={isLoading}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            >
                                <option value="non_compliant">Non-compliant</option>
                                <option value="compliant">Compliant</option>
                            </select>
                            <p className="mt-1 text-xs text-slate-500">
                                Compliant mode starts in pending activation and cannot be downgraded later.
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="workflowMode">Business Mode</Label>
                            <select
                                id="workflowMode"
                                value={formData.workflowMode}
                                onChange={(e) => setFormData({ ...formData, workflowMode: e.target.value })}
                                disabled={isLoading}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            >
                                {WORKFLOW_MODE_VALUES.map((mode) => (
                                    <option key={mode} value={mode}>{WORKFLOW_MODE_LABELS[mode] || mode}</option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-slate-500">
                                You can switch this later in Settings (master admin only).
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="companyName">Company Name</Label>
                                <Input
                                    id="companyName"
                                    type="text"
                                    placeholder="Acme Corp"
                                    value={formData.companyName}
                                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                    required
                                    minLength={3}
                                    maxLength={100}
                                    disabled={isLoading}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label htmlFor="adminEmail">Admin Email</Label>
                                <Input
                                    id="adminEmail"
                                    type="email"
                                    placeholder="admin@acme.com"
                                    value={formData.adminEmail}
                                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                                    required
                                    disabled={isLoading}
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="adminPassword">Admin Password</Label>
                            <Input
                                id="adminPassword"
                                type="password"
                                placeholder="Create a strong password"
                                value={formData.adminPassword}
                                onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                                required
                                disabled={isLoading}
                                className="mt-1"
                            />
                            {formData.adminPassword && (
                                <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-1">
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
                            className="w-full bg-slate-700 hover:bg-slate-800"
                            disabled={isLoading || !isPasswordValid || !passwordsMatch}
                        >
                            {isLoading ? 'Creating Company...' : 'Create Company'}
                        </Button>
                        <p className="text-xs text-center text-slate-500 mt-1">
                            Standard company registration may be activated immediately when auto-accept is enabled.
                        </p>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-slate-600">
                            Already have a company?{' '}
                            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                Sign in here
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../src/services/api.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function RegisterCompany() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        companyName: '',
        adminEmail: '',
        adminPassword: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Password validation rules  
    const passwordValidations = {
        minLength: formData.adminPassword.length >= 8,
        hasUppercase: /[A-Z]/.test(formData.adminPassword),
        hasLowercase: /[a-z]/.test(formData.adminPassword),
        hasNumber: /\d/.test(formData.adminPassword),
        hasSpecial: /[@$!%*?&]/.test(formData.adminPassword)
    };

    const isPasswordValid = Object.values(passwordValidations).every(v => v);
    const passwordsMatch = formData.adminPassword === formData.confirmPassword;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(null);

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
            // Call the public registration API (no auth required)
            // This creates a PENDING request for admin approval
            const response = await api.post('/admin/tenants/register', {
                name: formData.companyName,
                adminEmail: formData.adminEmail,
                adminPassword: formData.adminPassword
            });

            if (response.data.success) {
                setSuccess({
                    status: 'pending',
                    message: response.data.message
                });
            } else {
                setError(response.data.message || 'Registration failed');
            }

        } catch (err) {
            const errorMessage = err.response?.data?.message || 'Registration failed. Please try again.';
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

    // Success screen - Request Submitted
    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                        <CheckCircle2 className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 mb-2">Request Submitted!</h1>
                        <p className="text-slate-600 mb-6">{success.message}</p>

                        <div className="bg-blue-50 rounded-lg p-4 text-left mb-6">
                            <p className="text-sm font-semibold text-blue-800 mb-2">What happens next?</p>
                            <ul className="text-sm text-blue-700 space-y-1">
                                <li>• Our team will review your request</li>
                                <li>• Once approved, your company database will be created</li>
                                <li>• You will receive login credentials via email</li>
                            </ul>
                        </div>

                        <Button onClick={() => navigate('/login')} className="w-full" variant="outline">
                            Back to Login
                        </Button>
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
                            <div className="w-16 h-16 bg-indigo-600 rounded-lg flex items-center justify-center">
                                <Building2 className="w-10 h-10 text-white" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">Register Your Company</h1>
                        <p className="text-slate-600 mt-2">Create a new company account on SKUpervisor</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Registration Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
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

                            {/* Password Requirements */}
                            {formData.adminPassword && (
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

                        {/* Info Box */}
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm font-medium text-blue-900 flex items-center gap-2">
                                <Building2 className="w-4 h-4" />
                                How it works
                            </p>
                            <p className="text-xs text-blue-700 mt-1">
                                Your registration will be reviewed by our team.
                                Once approved, you'll receive your login credentials and company token.
                            </p>
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-700"
                            disabled={isLoading || !isPasswordValid || !passwordsMatch}
                        >
                            {isLoading ? 'Creating Company...' : 'Create Company'}
                        </Button>
                    </form>

                    {/* Login Link */}
                    <div className="mt-6 text-center">
                        <p className="text-sm text-slate-600">
                            Already have a company?{' '}
                            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                Sign in here
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-sm text-slate-500 mt-6">
                    SKUpervisor Multi-Tenancy v1.0
                </p>
            </div>
        </div>
    );
}

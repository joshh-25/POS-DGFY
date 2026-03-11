
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../src/services/api.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, XCircle, AlertTriangle, Star } from 'lucide-react';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

export default function RegisterCompany() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        companyName: '',
        adminEmail: '',
        adminPassword: '',
        confirmPassword: ''
    });
    const [selectedPlan, setSelectedPlan] = useState('standard');
    const [paypalSubscriptionId, setPaypalSubscriptionId] = useState(null);

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

    const handleSubmit = async (e, directSubscriptionId = null) => {
        if (e) e.preventDefault();
        setError('');
        setSuccess(null);

        // Verify password match again (sanity check)
        if (formData.adminPassword !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (!isPasswordValid) {
            setError('Password does not meet security requirements');
            return;
        }

        // Use direct ID if provided (from onApprove), otherwise fall back to state
        // This fixes the race condition where state hasn't updated yet
        const activeSubscriptionId = directSubscriptionId || paypalSubscriptionId;

        setIsLoading(true);

        try {
            const response = await api.post('/admin/tenants/register', {
                name: formData.companyName,
                adminEmail: formData.adminEmail,
                adminPassword: formData.adminPassword,
                plan: selectedPlan,
                subscriptionId: activeSubscriptionId
            });

            if (response.data.success) {


                setSuccess({
                    status: response.data.data.status,
                    message: response.data.message,
                    plan: response.data.data.plan
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

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                        <CheckCircle2 className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-900 mb-2">
                            {success.status === 'active' ? 'Account Activated!' : 'Request Submitted!'}
                        </h1>
                        <p className="text-slate-600 mb-6">{success.message}</p>

                        <div className="bg-blue-50 rounded-lg p-4 text-left mb-6">
                            <p className="text-sm font-semibold text-blue-800 mb-2">What happens next?</p>
                            <ul className="text-sm text-blue-700 space-y-1 mb-4">
                                {success.status === 'active' ? (
                                    <>
                                        <li>• Your Premium account is ready</li>
                                        <li>• You can login immediately</li>
                                        <li>• Access to AI features is unlocked</li>
                                    </>
                                ) : (
                                    <>
                                        <li>• Our team will review your request</li>
                                        <li>• You may need to upgrade later for AI features</li>
                                        <li>• You will receive login credentials via email</li>
                                    </>
                                )}
                            </ul>

                            {/* Display Company Token */}
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
                                <p className="text-[10px] text-blue-600 mt-2">
                                    Save this token! You'll need it or your email to identify your company during login.
                                </p>
                            </div>
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
        <PayPalScriptProvider options={{
            "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "test",
            vault: true,
            intent: "subscription"
        }}>
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
                            {/* Plan Selection */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div
                                    className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedPlan === 'standard' ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-slate-200 hover:border-indigo-300'}`}
                                    onClick={() => { setSelectedPlan('standard'); setPaypalSubscriptionId(null); }}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold text-slate-900">Standard</h3>
                                        <Building2 className="w-5 h-5 text-slate-500" />
                                    </div>
                                    <p className="text-sm text-slate-600">₱2,000 / month</p>
                                    <p className="text-xs text-slate-500 mt-1">Basic inventory features</p>
                                </div>
                                <div
                                    className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedPlan === 'premium' ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600' : 'border-slate-200 hover:border-indigo-300'}`}
                                    onClick={() => { setSelectedPlan('premium'); setPaypalSubscriptionId(null); }}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold text-indigo-700">Premium</h3>
                                        <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                                    </div>
                                    <p className="text-sm text-slate-600">₱3,000 / month</p>
                                    <p className="text-xs text-indigo-600 mt-1 font-medium">Instant Access + AI Chat</p>
                                </div>
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
                                        {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                                    </p>
                                )}
                            </div>

                            {/* PayPal subscription path */}
                            <div className="mt-4">
                                <p className="text-sm font-medium text-slate-700 mb-2">
                                    Subscribe via PayPal — activate instantly
                                </p>
                                <div className={!isPasswordValid || !passwordsMatch || !formData.companyName ? 'opacity-50 pointer-events-none' : ''}>
                                    <PayPalButtons
                                        style={{ layout: "vertical", label: "subscribe" }}
                                        createSubscription={(data, actions) => {
                                            const planId = selectedPlan === 'premium'
                                                ? (import.meta.env.VITE_PAYPAL_PREMIUM_PLAN_ID || import.meta.env.VITE_PAYPAL_PLAN_ID)
                                                : import.meta.env.VITE_PAYPAL_STANDARD_PLAN_ID;
                                            return actions.subscription.create({ plan_id: planId });
                                        }}
                                        onApprove={(data) => {
                                            setPaypalSubscriptionId(data.subscriptionID);
                                            handleSubmit(null, data.subscriptionID);
                                        }}
                                        onCancel={() => setError('PayPal subscription cancelled. You may still submit a registration request below.')}
                                        onError={(err) => {
                                            console.error('PayPal Error:', err);
                                            setError(`Payment failed: ${err.message || 'Unknown error'}. Please try again or submit a registration request below.`);
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-center text-slate-500 mt-1">
                                    {selectedPlan === 'premium' ? '₱3,000/month. Cancel anytime.' : '₱2,000/month. Cancel anytime.'}
                                </p>
                            </div>

                            {/* Divider */}
                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-200" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white px-2 text-slate-400">or</span>
                                </div>
                            </div>

                            {/* Manual registration path */}
                            <Button
                                type="submit"
                                className="w-full bg-slate-700 hover:bg-slate-800"
                                disabled={isLoading || !isPasswordValid || !passwordsMatch}
                            >
                                {isLoading ? 'Creating Request...' : 'Submit Registration Request'}
                            </Button>
                            <p className="text-xs text-center text-slate-500 mt-1">
                                Admin will review and approve your request manually.
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
        </PayPalScriptProvider>
    );
}

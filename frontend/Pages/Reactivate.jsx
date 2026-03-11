import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, RotateCcw, Loader2, Star, Building2 } from 'lucide-react';
import { reactivateWithPayPal, requestReactivationPublic } from '../src/services/paymentService.js';
import { resolveReactivatePayPalConfig } from '../src/utils/subscriptionUi.js';

const PLAN_DETAILS = {
  premium: {
    label: 'Premium',
    price: '₱3,000/month',
    icon: Star,
    iconClass: 'text-yellow-500 fill-yellow-500'
  },
  standard: {
    label: 'Standard',
    price: '₱2,000/month',
    icon: Building2,
    iconClass: 'text-slate-500'
  }
};

export default function Reactivate({ envOverrides = null }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const planParam = searchParams.get('plan');
  const env = envOverrides || import.meta.env;

  const plan = PLAN_DETAILS[planParam] ? planParam : 'standard';
  const planInfo = PLAN_DETAILS[plan];
  const PlanIcon = planInfo.icon;
  const paypalConfig = resolveReactivatePayPalConfig({ plan, env });

  const [paypalDone, setPaypalDone] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPayPalButtonReady, setIsPayPalButtonReady] = useState(false);
  const [isPayPalUnavailable, setIsPayPalUnavailable] = useState(false);

  useEffect(() => {
    if (!paypalConfig.canRender || isPayPalButtonReady) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setIsPayPalUnavailable(true);
    }, 8000);

    return () => clearTimeout(timeoutId);
  }, [paypalConfig.canRender, isPayPalButtonReady]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid Link</h1>
          <p className="text-slate-600 mb-6">No company token found. Please return to the login page and try again.</p>
          <Link to="/login">
            <Button variant="outline" className="w-full">Back to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handlePayPalApprove = async (subscriptionID) => {
    setError('');
    try {
      await reactivateWithPayPal(subscriptionID, token);
      setPaypalDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Reactivation failed. Please try again or contact support.');
    }
  };

  const handleEmailRequest = async () => {
    setIsEmailLoading(true);
    setError('');
    try {
      await requestReactivationPublic(token);
      setEmailSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send request. Please try again.');
    } finally {
      setIsEmailLoading(false);
    }
  };

  if (paypalDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Account Reactivated!</h1>
          <p className="text-slate-600 mb-6">
            Your {planInfo.label} subscription is active. You can sign in now.
          </p>
          <Link to="/login">
            <Button className="w-full">Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src="/logo.png" alt="SKUpervisor" className="h-16" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Reactivate Your Account</h1>
            <p className="text-slate-600 mt-1">Your account is currently inactive</p>
          </div>

          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100 mb-6">
            <PlanIcon className={`w-6 h-6 shrink-0 ${planInfo.iconClass}`} />
            <div>
              <p className="font-semibold text-slate-900">{planInfo.label} Plan</p>
              <p className="text-sm text-slate-500">{planInfo.price}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mb-6">
            <p className="text-sm font-medium text-slate-700 mb-3">
              Reactivate instantly via PayPal
            </p>
            {!paypalConfig.canRender || isPayPalUnavailable ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <p className="font-medium">PayPal is temporarily unavailable.</p>
                <p className="text-xs mt-1">
                  {paypalConfig.reason || 'The PayPal button could not be loaded. You can continue with admin reactivation below.'}
                </p>
              </div>
            ) : (
              <PayPalScriptProvider options={{
                'client-id': paypalConfig.clientId,
                vault: true,
                intent: 'subscription'
              }}>
                <PayPalButtons
                  style={{ layout: 'vertical', label: 'subscribe' }}
                  createSubscription={(data, actions) => {
                    return actions.subscription.create({ plan_id: paypalConfig.planId });
                  }}
                  onInit={() => {
                    setIsPayPalButtonReady(true);
                    setIsPayPalUnavailable(false);
                  }}
                  onApprove={(data) => handlePayPalApprove(data.subscriptionID)}
                  onCancel={() => setError('PayPal subscription cancelled. You can try again below.')}
                  onError={(err) => {
                    setIsPayPalUnavailable(true);
                    setError(`PayPal error: ${err.message || 'Unknown error'}. Please try again.`);
                  }}
                />
              </PayPalScriptProvider>
            )}
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">or</span>
            </div>
          </div>

          {emailSent ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-800">Request sent!</p>
              <p className="text-xs text-green-700 mt-1">An administrator will review and restore your access shortly.</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-3">
                Prefer to have an admin restore your access?
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleEmailRequest}
                disabled={isEmailLoading}
              >
                {isEmailLoading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
                  : <><RotateCcw className="w-4 h-4 mr-2" />Request Admin Reactivation</>
                }
              </Button>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-slate-500 hover:text-slate-700">
              Back to Login
            </Link>
          </div>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">SKUpervisor v1.0.0</p>
      </div>
    </div>
  );
}

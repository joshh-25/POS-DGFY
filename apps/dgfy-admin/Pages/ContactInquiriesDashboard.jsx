import React, { useEffect, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Eye,
    EyeOff,
    Inbox,
    KeyRound,
    LockKeyhole,
    MailCheck,
    RefreshCw,
    ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as adminService from '@/services/adminService';

const PROVISIONAL_SUPPORT_EMAIL = 'support@dgfy.ph';

const formatUpdatedAt = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

export default function ContactInquiriesDashboard() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [formError, setFormError] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [supportContact, setSupportContact] = useState(null);
    const [supportEmail, setSupportEmail] = useState(PROVISIONAL_SUPPORT_EMAIL);
    const [supportCode, setSupportCode] = useState('');
    const [supportMonitoringConfirmed, setSupportMonitoringConfirmed] = useState(false);
    const [supportLoading, setSupportLoading] = useState(true);
    const [supportSaving, setSupportSaving] = useState(false);
    const [supportSendingCode, setSupportSendingCode] = useState(false);
    const [supportVerifying, setSupportVerifying] = useState(false);
    const [supportLoadError, setSupportLoadError] = useState('');
    const [supportFormError, setSupportFormError] = useState('');
    const [verificationRequested, setVerificationRequested] = useState(false);
    const secureContext = typeof window !== 'undefined' && window.isSecureContext === true;

    const loadStatus = async () => {
        setLoading(true);
        setLoadError('');
        try {
            setStatus(await adminService.getPin4msProviderConfigStatus());
        } catch (error) {
            setStatus(null);
            setLoadError(error?.response?.data?.message || 'Could not load Pin4MS connection settings.');
        } finally {
            setLoading(false);
        }
    };

    const loadSupportContact = async () => {
        setSupportLoading(true);
        setSupportLoadError('');
        try {
            const nextStatus = await adminService.getStorefrontSupportEmailStatus();
            setSupportContact(nextStatus);
            setSupportEmail(nextStatus?.pendingEmail || nextStatus?.activeEmail || PROVISIONAL_SUPPORT_EMAIL);
            setVerificationRequested(Boolean(nextStatus?.pendingEmail));
        } catch (error) {
            setSupportContact(null);
            setSupportLoadError(error?.response?.data?.message || 'Could not load Storefront support email settings.');
        } finally {
            setSupportLoading(false);
        }
    };

    const handleRefresh = async () => {
        await Promise.all([loadStatus(), loadSupportContact()]);
    };

    useEffect(() => {
        loadStatus();
        loadSupportContact();
    }, []);

    const handleSaveSupportEmail = async (event) => {
        event.preventDefault();
        setSupportFormError('');
        setSupportSaving(true);
        try {
            const nextStatus = await adminService.saveStorefrontSupportEmail(supportEmail.trim());
            setSupportContact(nextStatus);
            setSupportEmail(nextStatus?.activeEmail || supportEmail.trim());
            setSupportCode('');
            setSupportMonitoringConfirmed(false);
            setVerificationRequested(false);
            toast.success('Support email saved and shown on Storefront.');
        } catch (error) {
            setSupportFormError(error?.response?.data?.message || 'The support email could not be saved. Check the address and try again.');
        } finally {
            setSupportSaving(false);
        }
    };

    const handleRequestSupportVerification = async () => {
        const activeEmail = supportContact?.activeEmail;
        if (!activeEmail) return;
        setSupportFormError('');
        setSupportSendingCode(true);
        try {
            const nextStatus = await adminService.requestStorefrontSupportEmailVerification(activeEmail);
            setSupportContact(nextStatus);
            setSupportCode('');
            setSupportMonitoringConfirmed(false);
            setVerificationRequested(true);
            toast.success('Optional verification code sent to the current support inbox.');
        } catch (error) {
            setSupportFormError(error?.response?.data?.message || 'The optional verification code could not be sent. The configured email remains public.');
        } finally {
            setSupportSendingCode(false);
        }
    };

    const handleVerifySupportEmail = async (event) => {
        event.preventDefault();
        setSupportFormError('');
        setSupportVerifying(true);
        try {
            const nextStatus = await adminService.verifyStorefrontSupportEmail({
                email: supportContact?.activeEmail,
                code: supportCode.trim(),
                monitoringConfirmed: supportMonitoringConfirmed
            });
            setSupportContact(nextStatus);
            setSupportEmail(nextStatus?.activeEmail || supportEmail.trim());
            setSupportCode('');
            setSupportMonitoringConfirmed(false);
            setVerificationRequested(false);
            toast.success('Storefront support email verified.');
        } catch (error) {
            setSupportFormError(error?.response?.data?.message || 'The support email could not be verified. Request a new code and try again.');
        } finally {
            setSupportVerifying(false);
        }
    };

    const handleSave = async (event) => {
        event.preventDefault();
        setFormError('');
        const trimmedKey = apiKey.trim();
        if (!trimmedKey) {
            setFormError('Enter the API key generated in Pin4MS.');
            return;
        }

        setSaving(true);
        try {
            const updatedStatus = await adminService.savePin4msProviderApiKey(trimmedKey);
            setStatus(updatedStatus);
            setApiKey('');
            setShowApiKey(false);
            toast.success('Pin4MS API key saved securely.');
        } catch (error) {
            setFormError(error?.response?.data?.message || 'The API key could not be saved. Check the connection and try again.');
        } finally {
            setSaving(false);
        }
    };

    const secureStorageReady = status?.secureStorageAvailable === true;
    const canEnterKey = secureContext && secureStorageReady && !loading;
    const canVerifyConfiguredSupportEmail = Boolean(
        supportContact?.activeEmail
        && supportContact.activeEmail === supportEmail.trim().toLowerCase()
    );
    const updatedAt = formatUpdatedAt(status?.updatedAt);

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#1A4E8D]">Platform operations</p>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Contact inquiries</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                            Configure the Pin4MS credential for the public Contact Us form and prepare the admin inbox for incoming submissions.
                        </p>
                    </div>
                    <Button type="button" variant="outline" onClick={handleRefresh} disabled={loading || supportLoading} className="shrink-0">
                        <RefreshCw className={loading || supportLoading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                        Refresh
                    </Button>
                </div>
            </header>

            {loadError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <span>{loadError}</span>
                    <Button type="button" size="sm" variant="outline" onClick={loadStatus} disabled={loading}>Try again</Button>
                </div>
            )}

            {supportLoadError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <span>{supportLoadError}</span>
                    <Button type="button" size="sm" variant="outline" onClick={loadSupportContact} disabled={supportLoading}>Try again</Button>
                </div>
            )}

            <section aria-labelledby="storefront-support-email-title" className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-5 sm:p-6">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                            <MailCheck className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 id="storefront-support-email-title" className="text-lg font-semibold text-slate-900">Storefront support email</h2>
                                {supportContact?.activeEmailVerifiedAt && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        Email verified
                                    </span>
                                )}
                                {supportContact?.publicEmailConfigured && !supportContact.activeEmailVerifiedAt && (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                        Public · not verified
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-sm leading-5 text-slate-600">
                                Saving makes this address visible on the public Storefront Contact Us page immediately. Email verification and monitoring confirmation are optional.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] sm:p-6">
                    <form onSubmit={handleSaveSupportEmail} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="storefront-support-email">Storefront support email</Label>
                            <Input
                                id="storefront-support-email"
                                name="storefront-support-email"
                                type="email"
                                autoComplete="email"
                                maxLength={254}
                                value={supportEmail}
                                onChange={(event) => {
                                    setSupportEmail(event.target.value);
                                    setSupportCode('');
                                    setSupportMonitoringConfirmed(false);
                                    setSupportFormError('');
                                }}
                                disabled={supportLoading || supportSaving || supportSendingCode || supportVerifying}
                                required
                            />
                            <p className="text-xs leading-5 text-slate-500">
                                <code>support@dgfy.ph</code> is the provisional address. It will be visible to customers once saved, even if optional verification has not been completed.
                            </p>
                        </div>
                        {supportContact?.publicEmailConfigured && supportContact.activeEmail && (
                            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                                Current public email: <a className="font-semibold underline underline-offset-2" href={`mailto:${supportContact.activeEmail}`}>{supportContact.activeEmail}</a>
                            </p>
                        )}
                        {supportFormError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{supportFormError}</p>}
                        <Button type="submit" disabled={supportLoading || supportSaving || supportVerifying || !supportEmail.trim()}>
                            {supportSaving ? 'Saving…' : supportContact?.publicEmailConfigured ? 'Save support email' : 'Save and show support email'}
                        </Button>
                    </form>

                    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">Optional verification</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-600">Verification checks that someone can receive the email. It does not control whether the address appears publicly.</p>
                            {supportContact?.activeEmail && (
                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                    Optional verification applies to the currently public address: <span className="font-semibold">{supportContact.activeEmail}</span>. Save any address change first.
                                </p>
                            )}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleRequestSupportVerification}
                            disabled={supportLoading || supportSaving || supportSendingCode || supportVerifying || !canVerifyConfiguredSupportEmail}
                        >
                            {supportSendingCode ? 'Sending code…' : verificationRequested ? 'Resend verification code' : 'Send optional verification code'}
                        </Button>
                        <form onSubmit={handleVerifySupportEmail} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="storefront-support-email-code">Six-digit email code</Label>
                                <Input
                                    id="storefront-support-email-code"
                                    name="storefront-support-email-code"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9]{6}"
                                    maxLength={6}
                                    value={supportCode}
                                    onChange={(event) => setSupportCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                    disabled={supportLoading || supportVerifying || !verificationRequested}
                                    required
                                />
                            </div>
                            <label className="flex items-start gap-3 text-sm leading-5 text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={supportMonitoringConfirmed}
                                    onChange={(event) => setSupportMonitoringConfirmed(event.target.checked)}
                                    disabled={supportLoading || supportVerifying || !verificationRequested}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-[#1A4E8D] focus:ring-[#1A4E8D]"
                                />
                                <span>Optionally confirm that this inbox is monitored for DGFY Storefront support.</span>
                            </label>
                            <Button
                                type="submit"
                                variant="outline"
                                disabled={supportLoading || supportVerifying || !verificationRequested || supportCode.length !== 6}
                                className="w-full sm:w-auto"
                            >
                                {supportVerifying ? 'Verifying…' : 'Confirm optional verification'}
                            </Button>
                        </form>
                    </div>
                </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.85fr)]">
                <section aria-labelledby="contact-inquiries-inbox-title" className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5 sm:p-6">
                        <div>
                            <h2 id="contact-inquiries-inbox-title" className="text-lg font-semibold text-slate-900">Submission inbox</h2>
                            <p className="mt-1 text-sm text-slate-600">Contact form messages will be reviewed here.</p>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                            Sync not connected
                        </span>
                    </div>

                    <div className="flex min-h-72 flex-col items-center justify-center px-5 py-10 text-center sm:min-h-80">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                            <Inbox className="h-7 w-7" aria-hidden="true" />
                        </div>
                        <h3 className="mt-4 text-base font-semibold text-slate-900">Your inbox is ready</h3>
                        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
                            Pin4MS submission reading has not been connected yet. Once its read-API details are confirmed, new inquiries can appear here without mixing them with Feedback.
                        </p>
                        <div className="mt-5 inline-flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs leading-5 text-slate-600">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                            Saving an API key does not verify the provider connection or load submissions.
                        </div>
                    </div>
                </section>

                <section aria-labelledby="pin4ms-connection-title" className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1A4E8D]">
                                <KeyRound className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 id="pin4ms-connection-title" className="text-lg font-semibold text-slate-900">Pin4MS connection</h2>
                                    {status?.configured && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            Key saved
                                        </span>
                                    )}
                                    {status && !status.configured && (
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                            Not configured
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-sm leading-5 text-slate-600">
                                    Paste the per-form API key generated in Pin4MS. DGFY stores it encrypted and never shows it again.
                                </p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSave} className="space-y-4 p-5 sm:p-6">
                        <div className="space-y-2">
                            <Label htmlFor="pin4ms-api-key">Pin4MS API key</Label>
                            <div className="relative">
                                <Input
                                    id="pin4ms-api-key"
                                    name="pin4ms-api-key"
                                    type={showApiKey ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    maxLength={4096}
                                    value={apiKey}
                                    onChange={(event) => setApiKey(event.target.value)}
                                    placeholder={status?.configured ? 'Enter a replacement key' : 'Paste the generated API key'}
                                    disabled={!canEnterKey || saving}
                                    aria-describedby="pin4ms-api-key-help"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey((visible) => !visible)}
                                    disabled={!canEnterKey || saving}
                                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {showApiKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                </button>
                            </div>
                            <p id="pin4ms-api-key-help" className="text-xs leading-5 text-slate-500">
                                The saved value is write-only. To change it later, enter the new Pin4MS key here.
                            </p>
                        </div>

                        {!secureContext && (
                            <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>Key entry is disabled on this non-secure address. Open Admin over HTTPS or localhost before entering a real key.</span>
                            </div>
                        )}

                        {secureContext && status && !secureStorageReady && (
                            <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>Secure key storage is not configured on this API environment yet. Saving will be enabled after its encryption secret is provisioned.</span>
                            </div>
                        )}

                        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</p>}

                        <Button type="submit" disabled={!canEnterKey || saving || !apiKey.trim()} className="w-full sm:w-auto">
                            {saving ? 'Saving securely…' : status?.configured ? 'Replace API key' : 'Save API key'}
                        </Button>

                        {status?.configured && updatedAt && (
                            <p className="text-xs text-slate-500">Last updated {updatedAt}</p>
                        )}
                    </form>

                    <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                        <div className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                            <p>The API key stays on the DGFY server, is encrypted before database storage, and is not saved in this browser.</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

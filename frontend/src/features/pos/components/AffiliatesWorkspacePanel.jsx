import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
    Ban,
    Banknote,
    CheckCircle2,
    Clock,
    Mail,
    Percent,
    QrCode as QrCodeIcon,
    RefreshCcw,
    Save,
    Send,
    ShieldAlert,
    Trash2,
    XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    approveAffiliateCashout,
    fetchAffiliateCashouts,
    fetchAffiliateQrPayload,
    fetchAffiliateSettings,
    fetchAffiliates,
    fetchAffiliateInvites,
    inviteAffiliate,
    cancelAffiliateInvite,
    markAffiliateCashoutPaid,
    rejectAffiliateCashout,
    updateAffiliateEnrollment,
    updateAffiliateSettings
} from '../services/affiliateService.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';

// Duplicated locally rather than imported - resolveUserPermissionList in TerminalOperationsWorkspace.jsx
// is not exported, and every sibling panel in this feature already re-implements this same check.
const resolveUserPermissionList = (user) => {
    if (Array.isArray(user?.permissions)) return user.permissions;
    if (typeof user?.permissions !== 'string') return [];
    try {
        const parsed = JSON.parse(user.permissions);
        if (Array.isArray(parsed)) return parsed;
        if (!parsed || typeof parsed !== 'object') return [];
        return Object.entries(parsed).flatMap(([entity, actions]) => (
            actions && typeof actions === 'object'
                ? Object.entries(actions).filter(([, allowed]) => allowed === true).map(([action]) => `${entity}:${action}`)
                : []
        ));
    } catch {
        return [];
    }
};

const money = (centavos) => `PHP ${(Number(centavos || 0) / 100).toFixed(2)}`;
const bpsToPercentString = (bps) => (bps === null || bps === undefined ? '' : String(Number(bps) / 100));
const percentStringToBps = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
};
const centavosToPesoString = (centavos) => String(Number(centavos || 0) / 100);
const pesoStringToCentavos = (value) => Math.max(0, Math.round((Number(value) || 0) * 100));

const affiliateDisplayName = (affiliate) => {
    const account = affiliate?.dgfyAccount || {};
    const fullName = [account.first_name, account.last_name].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
    return fullName || account.username || account.email || 'Affiliate';
};

const cashoutAffiliateDisplayName = (cashout) => affiliateDisplayName(cashout?.enrollment || {});

const payoutSnapshotSummary = (snapshot) => {
    if (!snapshot) return 'Payout method unavailable';
    if (snapshot.method_type === 'bank') {
        const last4 = String(snapshot.account_number || '').slice(-4);
        return `${snapshot.bank_name || 'Bank'} •••• ${last4 || '----'} (${snapshot.account_name || 'account'})`;
    }
    const label = snapshot.method_type === 'gcash' ? 'GCash' : snapshot.method_type === 'maya' ? 'Maya' : (snapshot.method_type || 'Wallet');
    return `${label} ${snapshot.mobile_number || ''}`.trim();
};

export default function AffiliatesWorkspacePanel({ terminalUser, locked = false, isOnline = true, sectionId }) {
    const isMasterAdmin = terminalUser?.is_master_admin === true;
    const permissionList = useMemo(() => resolveUserPermissionList(terminalUser), [terminalUser]);
    const canManage = isMasterAdmin || permissionList.includes('affiliates:manage');
    const canManageSettings = isMasterAdmin || permissionList.includes('affiliates:settings');
    const canView = canManage || canManageSettings || permissionList.includes('affiliates:view');
    const canApproveCashouts = isMasterAdmin || permissionList.includes('affiliates:cashout_approve');
    const canPayCashouts = isMasterAdmin || permissionList.includes('affiliates:cashout_pay');
    const canSeeCashoutQueue = canApproveCashouts || canPayCashouts;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [settingsDraft, setSettingsDraft] = useState(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [affiliates, setAffiliates] = useState([]);
    const [invites, setInvites] = useState([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRate, setInviteRate] = useState('');
    const [inviting, setInviting] = useState(false);
    const [inviteBusyId, setInviteBusyId] = useState(null);
    const [rateEdits, setRateEdits] = useState({});
    const [rowBusyId, setRowBusyId] = useState(null);
    const [qrByEnrollment, setQrByEnrollment] = useState({});
    const [cashouts, setCashouts] = useState([]);
    const [cashoutBusyId, setCashoutBusyId] = useState(null);
    const [payoutRefDrafts, setPayoutRefDrafts] = useState({});
    const [rejectReasonDrafts, setRejectReasonDrafts] = useState({});

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [settingsResult, affiliatesResult, cashoutsResult, invitesResult] = await Promise.all([
                fetchAffiliateSettings(),
                fetchAffiliates(),
                canSeeCashoutQueue ? fetchAffiliateCashouts() : Promise.resolve([]),
                canView ? fetchAffiliateInvites({ status: 'pending' }) : Promise.resolve([])
            ]);
            setSettingsDraft(settingsResult);
            setAffiliates(Array.isArray(affiliatesResult) ? affiliatesResult : []);
            setCashouts(Array.isArray(cashoutsResult) ? cashoutsResult : []);
            setInvites(Array.isArray(invitesResult) ? invitesResult : []);
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to load affiliate program data');
        } finally {
            setLoading(false);
        }
    }, [canSeeCashoutQueue, canView]);

    useEffect(() => {
        if (locked || !isOnline || !canView) return;
        loadData();
    }, [loadData, locked, isOnline, canView]);

    const handleSaveSettings = async () => {
        if (!canManageSettings || !settingsDraft) return;
        setSavingSettings(true);
        try {
            const updated = await updateAffiliateSettings({
                program_enabled: settingsDraft.program_enabled === true,
                default_rate_bps: percentStringToBps(bpsToPercentString(settingsDraft.default_rate_bps)) ?? 500,
                attribution_window_days: Math.max(1, Number(settingsDraft.attribution_window_days) || 60),
                min_cashout_centavos: pesoStringToCentavos(centavosToPesoString(settingsDraft.min_cashout_centavos)),
                auto_approve_enrollment: settingsDraft.auto_approve_enrollment === true
            });
            setSettingsDraft(updated);
            toast.success('Affiliate settings updated');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to update affiliate settings');
        } finally {
            setSavingSettings(false);
        }
    };

    const handleInvite = async () => {
        const email = inviteEmail.trim();
        if (!email) {
            toast.error('Enter the email to invite');
            return;
        }
        setInviting(true);
        try {
            const rateBps = inviteRate.trim() ? percentStringToBps(inviteRate) : null;
            const result = await inviteAffiliate({ email, commission_rate_bps: rateBps });
            if (result?.email_delivery?.sent === false) {
                toast.warning('Invite saved, but the email could not be sent. You can resend it.');
            } else {
                toast.success(result?.account_exists
                    ? 'Invite sent — they’ll get a link to accept'
                    : 'Invite sent — they’ll get a link to sign up');
            }
            setInviteEmail('');
            setInviteRate('');
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to send invite');
        } finally {
            setInviting(false);
        }
    };

    const handleCancelInvite = async (invite) => {
        setInviteBusyId(invite.invite_id);
        try {
            await cancelAffiliateInvite(invite.invite_id);
            toast.success('Invite cancelled');
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to cancel invite');
        } finally {
            setInviteBusyId(null);
        }
    };

    const handleStatusChange = async (enrollment, status) => {
        setRowBusyId(enrollment.enrollment_id);
        try {
            await updateAffiliateEnrollment(enrollment.enrollment_id, { status });
            toast.success(`Affiliate ${status}`);
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to update affiliate status');
        } finally {
            setRowBusyId(null);
        }
    };

    const handleSaveRate = async (enrollment) => {
        const draftValue = rateEdits[enrollment.enrollment_id];
        const rateBps = draftValue === '' || draftValue === undefined ? null : percentStringToBps(draftValue);
        setRowBusyId(enrollment.enrollment_id);
        try {
            await updateAffiliateEnrollment(enrollment.enrollment_id, { commission_rate_bps: rateBps });
            toast.success('Commission rate updated');
            setRateEdits((prev) => {
                const next = { ...prev };
                delete next[enrollment.enrollment_id];
                return next;
            });
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to update commission rate');
        } finally {
            setRowBusyId(null);
        }
    };

    const handleToggleQr = async (enrollment) => {
        const existing = qrByEnrollment[enrollment.enrollment_id];
        if (existing) {
            setQrByEnrollment((prev) => {
                const next = { ...prev };
                delete next[enrollment.enrollment_id];
                return next;
            });
            return;
        }
        setRowBusyId(enrollment.enrollment_id);
        try {
            const payload = await fetchAffiliateQrPayload(enrollment.enrollment_id);
            const dataUrl = payload?.url ? await QRCode.toDataURL(payload.url, { errorCorrectionLevel: 'M', margin: 1, width: 180 }) : null;
            setQrByEnrollment((prev) => ({ ...prev, [enrollment.enrollment_id]: { ...payload, dataUrl } }));
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to build the affiliate share link');
        } finally {
            setRowBusyId(null);
        }
    };

    const handleApproveCashout = async (cashout) => {
        setCashoutBusyId(cashout.cashout_id);
        try {
            await approveAffiliateCashout(cashout.cashout_id);
            toast.success('Cashout request approved');
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to approve cashout request');
        } finally {
            setCashoutBusyId(null);
        }
    };

    const handleMarkCashoutPaid = async (cashout) => {
        const externalPaymentRef = String(payoutRefDrafts[cashout.cashout_id] || '').trim();
        if (!externalPaymentRef) {
            toast.error('Enter a payment reference before marking this cashout as paid');
            return;
        }
        setCashoutBusyId(cashout.cashout_id);
        try {
            await markAffiliateCashoutPaid(cashout.cashout_id, { external_payment_ref: externalPaymentRef });
            toast.success('Cashout marked as paid');
            setPayoutRefDrafts((prev) => {
                const next = { ...prev };
                delete next[cashout.cashout_id];
                return next;
            });
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to mark cashout as paid');
        } finally {
            setCashoutBusyId(null);
        }
    };

    const handleRejectCashout = async (cashout) => {
        const rejectionReason = String(rejectReasonDrafts[cashout.cashout_id] || '').trim() || undefined;
        setCashoutBusyId(cashout.cashout_id);
        try {
            await rejectAffiliateCashout(cashout.cashout_id, { rejection_reason: rejectionReason });
            toast.success('Cashout request rejected');
            setRejectReasonDrafts((prev) => {
                const next = { ...prev };
                delete next[cashout.cashout_id];
                return next;
            });
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to reject cashout request');
        } finally {
            setCashoutBusyId(null);
        }
    };

    if (locked || !isOnline) {
        return (
            <div id={sectionId} className="p-1 text-sm text-slate-500">
                {locked ? 'Unlock the terminal to manage affiliates.' : 'The Affiliates program is only available online.'}
            </div>
        );
    }

    if (!canView) {
        return (
            <div id={sectionId} className="flex items-center gap-2 p-1 text-sm text-slate-500">
                <ShieldAlert className="h-4 w-4" />
                You do not have permission to view the affiliate program.
            </div>
        );
    }

    return (
        <div id={sectionId} className="space-y-5">
            {loading && <p className="text-sm text-slate-500">Loading affiliate program...</p>}
            {!loading && error && (
                <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <span>{error}</span>
                    <Button type="button" variant="outline" size="sm" onClick={loadData}>
                        <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
                    </Button>
                </div>
            )}

            {!loading && !error && settingsDraft && (
                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-black text-[#0F172A]">Program Settings</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500">
                                {settingsDraft.program_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <Switch
                                checked={settingsDraft.program_enabled === true}
                                disabled={!canManageSettings}
                                onCheckedChange={(checked) => setSettingsDraft((prev) => ({ ...prev, program_enabled: checked === true }))}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-[#0F172A]">Default commission rate (%)</label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                className="h-8 text-xs"
                                disabled={!canManageSettings}
                                value={bpsToPercentString(settingsDraft.default_rate_bps)}
                                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, default_rate_bps: percentStringToBps(e.target.value) }))}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-[#0F172A]">Attribution window (days)</label>
                            <Input
                                type="number"
                                min="1"
                                max="365"
                                className="h-8 text-xs"
                                disabled={!canManageSettings}
                                value={settingsDraft.attribution_window_days ?? ''}
                                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, attribution_window_days: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-[#0F172A]">Minimum cashout (PHP)</label>
                            <Input
                                type="number"
                                min="0"
                                step="1"
                                className="h-8 text-xs"
                                disabled={!canManageSettings}
                                value={centavosToPesoString(settingsDraft.min_cashout_centavos)}
                                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, min_cashout_centavos: pesoStringToCentavos(e.target.value) }))}
                            />
                        </div>
                        <div className="flex flex-col justify-between space-y-1">
                            <label className="text-xs font-semibold text-[#0F172A]">Allow self-serve enrollment</label>
                            <Switch
                                checked={settingsDraft.auto_approve_enrollment === true}
                                disabled={!canManageSettings}
                                onCheckedChange={(checked) => setSettingsDraft((prev) => ({ ...prev, auto_approve_enrollment: checked === true }))}
                            />
                        </div>
                    </div>
                    {canManageSettings && (
                        <div className="mt-3 flex justify-end">
                            <Button type="button" size="sm" onClick={handleSaveSettings} disabled={savingSettings}>
                                <Save className="mr-1.5 h-3.5 w-3.5" /> {savingSettings ? 'Saving...' : 'Save Settings'}
                            </Button>
                        </div>
                    )}
                </section>
            )}

            {!loading && !error && canManage && (
                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                    <h3 className="mb-1 text-sm font-black text-[#0F172A]">Invite Affiliate</h3>
                    <p className="mb-3 text-[11px] text-slate-500">
                        Invite anyone by email — even if they don’t have a DGFY account yet. They’ll get a link to
                        join or accept, and are affiliated with your store once they’re in.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1">
                            <label className="text-xs font-semibold text-[#0F172A]">Email to invite</label>
                            <Input
                                type="email"
                                className="h-8 text-xs"
                                placeholder="prospect@example.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        <div className="w-full space-y-1 sm:w-40">
                            <label className="text-xs font-semibold text-[#0F172A]">Rate override (%, optional)</label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                className="h-8 text-xs"
                                placeholder="Default"
                                value={inviteRate}
                                onChange={(e) => setInviteRate(e.target.value)}
                            />
                        </div>
                        <Button type="button" size="sm" onClick={handleInvite} disabled={inviting}>
                            <Send className="mr-1.5 h-3.5 w-3.5" /> {inviting ? 'Sending...' : 'Send Invite'}
                        </Button>
                    </div>

                    {invites.length > 0 && (
                        <div className="mt-4 space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                Pending invites ({invites.length})
                            </p>
                            {invites.map((invite) => (
                                <div key={invite.invite_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                                        <span className="text-[12px] font-semibold text-[#0F172A]">{invite.email}</span>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                            <Clock className="h-3 w-3" /> {invite.status}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="text-rose-600"
                                        disabled={inviteBusyId === invite.invite_id}
                                        onClick={() => handleCancelInvite(invite)}
                                    >
                                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Cancel
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {!loading && !error && (
                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                    <h3 className="mb-3 text-sm font-black text-[#0F172A]">Affiliates ({affiliates.length})</h3>
                    {affiliates.length === 0 ? (
                        <p className="text-xs text-slate-500">No affiliates enrolled yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {affiliates.map((affiliate) => {
                                const busy = rowBusyId === affiliate.enrollment_id;
                                const qr = qrByEnrollment[affiliate.enrollment_id];
                                const rateEditValue = rateEdits[affiliate.enrollment_id];
                                return (
                                    <div key={affiliate.enrollment_id} className="rounded-lg border border-slate-200 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="text-[13px] font-extrabold text-[#0F172A]">{affiliateDisplayName(affiliate)}</p>
                                                <p className="text-[11px] text-slate-500">
                                                    Code {affiliate.short_code} &middot; Status: {affiliate.status}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                                <span className="text-slate-500">Pending <strong className="text-[#0F172A]">{money(affiliate.earnings?.pending_centavos)}</strong></span>
                                                <span className="text-slate-500">Available <strong className="text-emerald-600">{money(affiliate.earnings?.available_centavos)}</strong></span>
                                                <span className="text-slate-500">Paid <strong className="text-[#0F172A]">{money(affiliate.earnings?.paid_centavos)}</strong></span>
                                            </div>
                                        </div>

                                        {canManage && (
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <div className="flex items-center gap-1.5">
                                                    <Percent className="h-3.5 w-3.5 text-slate-400" />
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        step="0.1"
                                                        className="h-7 w-24 text-xs"
                                                        placeholder={affiliate.commission_rate_bps == null ? 'Default' : ''}
                                                        value={rateEditValue !== undefined ? rateEditValue : bpsToPercentString(affiliate.commission_rate_bps)}
                                                        onChange={(e) => setRateEdits((prev) => ({ ...prev, [affiliate.enrollment_id]: e.target.value }))}
                                                    />
                                                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => handleSaveRate(affiliate)}>
                                                        <Save className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => handleToggleQr(affiliate)}>
                                                    <QrCodeIcon className="mr-1 h-3.5 w-3.5" /> {qr ? 'Hide' : 'Share Link'}
                                                </Button>
                                                {affiliate.status === 'active' ? (
                                                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => handleStatusChange(affiliate, 'suspended')}>
                                                        <Ban className="mr-1 h-3.5 w-3.5" /> Suspend
                                                    </Button>
                                                ) : affiliate.status === 'suspended' ? (
                                                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => handleStatusChange(affiliate, 'active')}>
                                                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Reactivate
                                                    </Button>
                                                ) : null}
                                                {affiliate.status !== 'revoked' && (
                                                    <Button type="button" size="sm" variant="outline" className="text-rose-600" disabled={busy} onClick={() => handleStatusChange(affiliate, 'revoked')}>
                                                        <XCircle className="mr-1 h-3.5 w-3.5" /> Revoke
                                                    </Button>
                                                )}
                                            </div>
                                        )}

                                        {qr && (
                                            <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                                                {qr.dataUrl ? (
                                                    <img src={qr.dataUrl} alt={`QR code for ${affiliate.short_code}`} className="h-24 w-24" />
                                                ) : (
                                                    <p className="text-[11px] text-slate-500">
                                                        No public storefront URL is configured yet - share the code below directly.
                                                    </p>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-semibold text-slate-500">Share code</p>
                                                    <p className="text-[13px] font-extrabold text-[#0F172A]">{qr.short_code}</p>
                                                    {qr.url && (
                                                        <p className="mt-1 truncate text-[11px] text-blue-600">{qr.url}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {!loading && !error && canSeeCashoutQueue && (
                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                    <h3 className="mb-3 text-sm font-black text-[#0F172A]">Cashout Requests ({cashouts.length})</h3>
                    {cashouts.length === 0 ? (
                        <p className="text-xs text-slate-500">No cashout requests yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {cashouts.map((cashout) => {
                                const busy = cashoutBusyId === cashout.cashout_id;
                                return (
                                    <div key={cashout.cashout_id} className="rounded-lg border border-slate-200 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="text-[13px] font-extrabold text-[#0F172A]">{cashoutAffiliateDisplayName(cashout)}</p>
                                                <p className="text-[11px] text-slate-500">
                                                    {payoutSnapshotSummary(cashout.payout_snapshot)} &middot; Status: {cashout.status}
                                                </p>
                                            </div>
                                            <span className="text-[13px] font-extrabold text-[#0F172A]">{money(cashout.amount_centavos)}</span>
                                        </div>

                                        {cashout.status === 'requested' && canApproveCashouts && (
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <Button type="button" size="sm" disabled={busy} onClick={() => handleApproveCashout(cashout)}>
                                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                                                </Button>
                                                <Input
                                                    className="h-8 w-48 text-xs"
                                                    placeholder="Rejection reason (optional)"
                                                    value={rejectReasonDrafts[cashout.cashout_id] || ''}
                                                    onChange={(e) => setRejectReasonDrafts((prev) => ({ ...prev, [cashout.cashout_id]: e.target.value }))}
                                                />
                                                <Button type="button" size="sm" variant="outline" className="text-rose-600" disabled={busy} onClick={() => handleRejectCashout(cashout)}>
                                                    <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                                                </Button>
                                            </div>
                                        )}

                                        {cashout.status === 'approved' && (
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                {canPayCashouts && (
                                                    <>
                                                        <Input
                                                            className="h-8 w-48 text-xs"
                                                            placeholder="External payment reference"
                                                            value={payoutRefDrafts[cashout.cashout_id] || ''}
                                                            onChange={(e) => setPayoutRefDrafts((prev) => ({ ...prev, [cashout.cashout_id]: e.target.value }))}
                                                        />
                                                        <Button type="button" size="sm" disabled={busy} onClick={() => handleMarkCashoutPaid(cashout)}>
                                                            <Banknote className="mr-1 h-3.5 w-3.5" /> Mark Paid
                                                        </Button>
                                                    </>
                                                )}
                                                {canApproveCashouts && (
                                                    <Button type="button" size="sm" variant="outline" className="text-rose-600" disabled={busy} onClick={() => handleRejectCashout(cashout)}>
                                                        <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    reactivateAffiliateEnrollment,
    updateAffiliateSettings,
    fetchAffiliatePriceRules,
    upsertAffiliatePriceRule,
    deactivateAffiliatePriceRule
} from '../services/affiliateService.js';
import { isIminWrapperRuntime, posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
    bpsToPercentString,
    centavosToPesoString,
    draftToRule,
    percentStringToBps,
    pesoStringToCentavos,
    priceRuleToDraft
} from '../affiliates/affiliatePresentation.js';
import AffiliateCashoutView from '../affiliates/AffiliateCashoutView.jsx';
import AffiliateInviteDialog from '../affiliates/AffiliateInviteDialog.jsx';
import AffiliateListView from '../affiliates/AffiliateListView.jsx';
import AffiliateSecondaryNav from '../affiliates/AffiliateSecondaryNav.jsx';
import AffiliateSettingsView from '../affiliates/AffiliateSettingsView.jsx';
import {
    createAffiliateLocalPreviewData,
    isAffiliateLocalPreviewEnabled
} from '../affiliates/affiliateLocalPreview.js';
import { validateAffiliatePriceRule } from '../utils/affiliatePricingPreview.js';
import '../affiliates/affiliateWorkspace.css';

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
                ? Object.entries(actions)
                    .filter(([, allowed]) => allowed === true)
                    .map(([action]) => `${entity}:${action}`)
                : []
        ));
    } catch {
        return [];
    }
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
    const [localPreviewEnabled] = useState(() => isAffiliateLocalPreviewEnabled());

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('list');
    const [renderedTab, setRenderedTab] = useState('list');
    const [paneInlineStyle, setPaneInlineStyle] = useState({
        opacity: 1,
        transition: 'transform 150ms ease, opacity 150ms ease'
    });
    const animationTimersRef = useRef([]);
    const isIminRuntime = isIminWrapperRuntime();
    const affiliateTabOrder = useMemo(
        () => ['list', ...(canSeeCashoutQueue ? ['cashout'] : []), 'settings'],
        [canSeeCashoutQueue]
    );
    const visibleTab = affiliateTabOrder.includes(renderedTab)
        ? renderedTab
        : (affiliateTabOrder[0] || 'list');
    const selectedTab = affiliateTabOrder.includes(activeTab)
        ? activeTab
        : (affiliateTabOrder[0] || 'list');
    const [settingsDraft, setSettingsDraft] = useState(null);
    const [initialSettingsDraft, setInitialSettingsDraft] = useState(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [affiliates, setAffiliates] = useState([]);
    const [invites, setInvites] = useState([]);
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
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

    const [priceRules, setPriceRules] = useState([]);
    const [templateRuleDraft, setTemplateRuleDraft] = useState({ rule_type: 'BASE_PRICE', value: '' });
    const [initialTemplateRuleDraft, setInitialTemplateRuleDraft] = useState({ rule_type: 'BASE_PRICE', value: '' });
    const [savingTemplateRule, setSavingTemplateRule] = useState(false);
    const [previewBasePricePesos, setPreviewBasePricePesos] = useState('100');
    const [affiliateRuleDrafts, setAffiliateRuleDrafts] = useState({});
    const [affiliateRuleBusyId, setAffiliateRuleBusyId] = useState(null);
    const [expandedRuleEnrollmentId, setExpandedRuleEnrollmentId] = useState(null);

    const resolveAffiliateTabIndex = useCallback((tabId) => {
        const index = affiliateTabOrder.indexOf(tabId);
        return index >= 0 ? index : 0;
    }, [affiliateTabOrder]);

    const clearAnimationTimers = useCallback(() => {
        animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        animationTimersRef.current = [];
    }, []);

    useEffect(() => () => clearAnimationTimers(), [clearAnimationTimers]);

    useEffect(() => {
        if (affiliateTabOrder.includes(activeTab)) return;
        clearAnimationTimers();
        const fallbackTab = affiliateTabOrder[0] || 'list';
        setActiveTab(fallbackTab);
        setRenderedTab(fallbackTab);
        setPaneInlineStyle({ opacity: 1, transition: 'none' });
    }, [activeTab, affiliateTabOrder, clearAnimationTimers]);

    const handleAffiliateTabChange = useCallback((nextTab) => {
        if (!affiliateTabOrder.includes(nextTab) || nextTab === activeTab) return;
        clearAnimationTimers();

        if (isIminRuntime) {
            setActiveTab(nextTab);
            setRenderedTab(nextTab);
            setPaneInlineStyle({ opacity: 1, transition: 'none' });
            return;
        }

        const movingForward = resolveAffiliateTabIndex(nextTab) > resolveAffiliateTabIndex(activeTab);
        const exitOffset = movingForward ? -28 : 28;
        const enterOffset = movingForward ? 28 : -28;

        setActiveTab(nextTab);
        setPaneInlineStyle({
            transform: `translateX(${exitOffset}px)`,
            opacity: 0,
            transition: 'transform 150ms ease, opacity 150ms ease'
        });

        const swapTimer = window.setTimeout(() => {
            setRenderedTab(nextTab);
            setPaneInlineStyle({
                transform: `translateX(${enterOffset}px)`,
                opacity: 0,
                transition: 'none'
            });

            const enterTimer = window.setTimeout(() => {
                setPaneInlineStyle({
                    transform: 'translateX(0)',
                    opacity: 1,
                    transition: 'transform 150ms ease, opacity 150ms ease'
                });

                const settleTimer = window.setTimeout(() => {
                    setPaneInlineStyle({ opacity: 1, transition: 'none' });
                }, 150);
                animationTimersRef.current.push(settleTimer);
            }, 16);

            animationTimersRef.current.push(enterTimer);
        }, 150);

        animationTimersRef.current.push(swapTimer);
    }, [activeTab, affiliateTabOrder, clearAnimationTimers, isIminRuntime, resolveAffiliateTabIndex]);

    const blockLocalPreviewAction = useCallback(() => {
        if (!localPreviewEnabled) return false;
        toast.warning('Local affiliate preview is read-only. Remove affiliate_preview=1 from the URL to return to live data.');
        return true;
    }, [localPreviewEnabled]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            if (localPreviewEnabled) {
                const preview = createAffiliateLocalPreviewData();
                setSettingsDraft(preview.settings);
                setInitialSettingsDraft({ ...preview.settings });
                setAffiliates(preview.affiliates);
                setCashouts(preview.cashouts);
                setInvites(preview.invites);
                setPriceRules(preview.priceRules);
                const previewTemplateRule = preview.priceRules.find((rule) => rule.enrollment_id === 0 && rule.item_id === 0) || null;
                const previewTemplateDraft = priceRuleToDraft(previewTemplateRule);
                setTemplateRuleDraft(previewTemplateDraft);
                setInitialTemplateRuleDraft({ ...previewTemplateDraft });
                return;
            }

            const [settingsResult, affiliatesResult, cashoutsResult, invitesResult, priceRulesResult] = await Promise.all([
                fetchAffiliateSettings(),
                fetchAffiliates(),
                canSeeCashoutQueue ? fetchAffiliateCashouts() : Promise.resolve([]),
                canView ? fetchAffiliateInvites({ status: 'pending' }) : Promise.resolve([]),
                canView ? fetchAffiliatePriceRules() : Promise.resolve([])
            ]);
            setSettingsDraft(settingsResult);
            setInitialSettingsDraft(settingsResult ? { ...settingsResult } : null);
            setAffiliates(Array.isArray(affiliatesResult) ? affiliatesResult : []);
            setCashouts(Array.isArray(cashoutsResult) ? cashoutsResult : []);
            setInvites(Array.isArray(invitesResult) ? invitesResult : []);
            const loadedPriceRules = Array.isArray(priceRulesResult) ? priceRulesResult : [];
            setPriceRules(loadedPriceRules);
            const loadedTemplateRule = loadedPriceRules.find((rule) => rule.enrollment_id === 0 && rule.item_id === 0) || null;
            const loadedTemplateDraft = priceRuleToDraft(loadedTemplateRule);
            setTemplateRuleDraft(loadedTemplateDraft);
            setInitialTemplateRuleDraft({ ...loadedTemplateDraft });
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to load affiliate program data');
        } finally {
            setLoading(false);
        }
    }, [canSeeCashoutQueue, canView, localPreviewEnabled]);

    useEffect(() => {
        if (locked || !isOnline || !canView) return;
        loadData();
    }, [loadData, locked, isOnline, canView]);

    const handleSaveAllSettings = async () => {
        if (blockLocalPreviewAction() || !canManageSettings || !settingsDraft) return;

        const rule = draftToRule(templateRuleDraft);
        const validity = validateAffiliatePriceRule({ rule });
        if (!validity.valid) {
            toast.error('This price rule is not valid yet - check the value entered');
            return;
        }

        setSavingSettings(true);
        setSavingTemplateRule(true);
        try {
            // attribution_window_days is intentionally not shown: it is not enforced in accrual and
            // the session-scoped attribution cookie makes a days setting misleading.
            const updated = await updateAffiliateSettings({
                program_enabled: settingsDraft.program_enabled === true,
                default_rate_bps: percentStringToBps(bpsToPercentString(settingsDraft.default_rate_bps)) ?? 500,
                min_cashout_centavos: pesoStringToCentavos(centavosToPesoString(settingsDraft.min_cashout_centavos)),
                auto_approve_enrollment: settingsDraft.auto_approve_enrollment === true,
                commission_type: settingsDraft.commission_type || 'PERCENTAGE_OF_BASE',
                settlement_policy: settingsDraft.settlement_policy || null,
                commission_base_mode: settingsDraft.commission_base_mode || 'discounted_subtotal'
            });

            await upsertAffiliatePriceRule({
                rule_type: rule.type,
                rate_bps: rule.rateBps,
                amount_centavos: rule.amountCentavos
            });

            setSettingsDraft(updated);
            setInitialSettingsDraft(updated ? { ...updated } : null);
            await loadData();
            toast.success('Affiliate settings updated');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to update affiliate settings');
        } finally {
            setSavingSettings(false);
            setSavingTemplateRule(false);
        }
    };

    const handleSaveAffiliateRule = async (enrollment) => {
        if (blockLocalPreviewAction()) return;
        const draft = affiliateRuleDrafts[enrollment.enrollment_id];
        if (!draft) return;
        setAffiliateRuleBusyId(enrollment.enrollment_id);
        try {
            const rule = draftToRule(draft);
            const validity = validateAffiliatePriceRule({ rule });
            if (!validity.valid) {
                toast.error('This price rule is not valid yet - check the value entered');
                return;
            }
            await upsertAffiliatePriceRule({
                enrollment_id: enrollment.enrollment_id,
                rule_type: rule.type,
                rate_bps: rule.rateBps,
                amount_centavos: rule.amountCentavos
            });
            toast.success('Affiliate price override saved');
            setAffiliateRuleDrafts((previous) => {
                const next = { ...previous };
                delete next[enrollment.enrollment_id];
                return next;
            });
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to save affiliate price override');
        } finally {
            setAffiliateRuleBusyId(null);
        }
    };

    const handleToggleAffiliateRuleEditor = (enrollment) => {
        if (expandedRuleEnrollmentId === enrollment.enrollment_id) {
            setExpandedRuleEnrollmentId(null);
            return;
        }
        const existingRule = priceRules.find((rule) => rule.enrollment_id === enrollment.enrollment_id && rule.item_id === 0);
        setAffiliateRuleDrafts((previous) => ({ ...previous, [enrollment.enrollment_id]: priceRuleToDraft(existingRule) }));
        setExpandedRuleEnrollmentId(enrollment.enrollment_id);
    };

    const handleClearAffiliateRule = async (enrollment) => {
        if (blockLocalPreviewAction()) return;
        const existingRule = priceRules.find((rule) => rule.enrollment_id === enrollment.enrollment_id && rule.item_id === 0);
        if (!existingRule) return;
        setAffiliateRuleBusyId(enrollment.enrollment_id);
        try {
            await deactivateAffiliatePriceRule(existingRule.price_rule_id);
            toast.success('Affiliate price override removed - back to the tenant template');
            setAffiliateRuleDrafts((previous) => {
                const next = { ...previous };
                delete next[enrollment.enrollment_id];
                return next;
            });
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to remove affiliate price override');
        } finally {
            setAffiliateRuleBusyId(null);
        }
    };

    const handleInvite = async () => {
        if (blockLocalPreviewAction()) return;
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
                toast.warning('Invite saved, but the email could not be sent. The pending invite is visible in Affiliates List, where you can cancel it.');
            } else {
                toast.success(result?.account_exists
                    ? 'Invite sent — they’ll get a link to accept. The pending invite is visible in Affiliates List.'
                    : 'Invite sent — they’ll get a link to sign up. The pending invite is visible in Affiliates List.');
            }
            setInviteEmail('');
            setInviteRate('');
            setInviteDialogOpen(false);
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to send invite');
        } finally {
            setInviting(false);
        }
    };

    const handleCancelInvite = async (invite) => {
        if (blockLocalPreviewAction()) return;
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
        if (blockLocalPreviewAction()) return;
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

    const handleReactivate = async (enrollment) => {
        if (blockLocalPreviewAction()) return;
        setRowBusyId(enrollment.enrollment_id);
        try {
            await reactivateAffiliateEnrollment(enrollment.enrollment_id);
            toast.success('Affiliate reactivated');
            await loadData();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to reactivate affiliate');
        } finally {
            setRowBusyId(null);
        }
    };

    const handleSaveRate = async (enrollment) => {
        if (blockLocalPreviewAction()) return;
        const draftValue = rateEdits[enrollment.enrollment_id];
        const rateBps = draftValue === '' || draftValue === undefined ? null : percentStringToBps(draftValue);
        setRowBusyId(enrollment.enrollment_id);
        try {
            await updateAffiliateEnrollment(enrollment.enrollment_id, { commission_rate_bps: rateBps });
            toast.success('Commission rate updated');
            setRateEdits((previous) => {
                const next = { ...previous };
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
            setQrByEnrollment((previous) => {
                const next = { ...previous };
                delete next[enrollment.enrollment_id];
                return next;
            });
            return;
        }
        if (blockLocalPreviewAction()) return;
        setRowBusyId(enrollment.enrollment_id);
        try {
            const payload = await fetchAffiliateQrPayload(enrollment.enrollment_id);
            const dataUrl = payload?.url
                ? await QRCode.toDataURL(payload.url, { errorCorrectionLevel: 'M', margin: 1, width: 180 })
                : null;
            setQrByEnrollment((previous) => ({ ...previous, [enrollment.enrollment_id]: { ...payload, dataUrl } }));
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to build the affiliate share link');
        } finally {
            setRowBusyId(null);
        }
    };

    const handleApproveCashout = async (cashout) => {
        if (blockLocalPreviewAction()) return;
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
        if (blockLocalPreviewAction()) return;
        const externalPaymentRef = String(payoutRefDrafts[cashout.cashout_id] || '').trim();
        if (!externalPaymentRef) {
            toast.error('Enter a payment reference before marking this cashout as paid');
            return;
        }
        setCashoutBusyId(cashout.cashout_id);
        try {
            await markAffiliateCashoutPaid(cashout.cashout_id, { external_payment_ref: externalPaymentRef });
            toast.success('Cashout marked as paid');
            setPayoutRefDrafts((previous) => {
                const next = { ...previous };
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
        if (blockLocalPreviewAction()) return;
        const rejectionReason = String(rejectReasonDrafts[cashout.cashout_id] || '').trim() || undefined;
        setCashoutBusyId(cashout.cashout_id);
        try {
            await rejectAffiliateCashout(cashout.cashout_id, { rejection_reason: rejectionReason });
            toast.success('Cashout request rejected');
            setRejectReasonDrafts((previous) => {
                const next = { ...previous };
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
                <ShieldAlert aria-hidden="true" className="h-4 w-4" />
                You do not have permission to view the affiliate program.
            </div>
        );
    }

    return (
        <div id={sectionId} className="pos-affiliates-workspace flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-4 overflow-hidden">
            {loading && (
                <p className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                    Loading affiliate program...
                </p>
            )}
            {!loading && error && (
                <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <span>{error}</span>
                    <Button type="button" variant="outline" size="sm" onClick={loadData}>
                        <RefreshCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Retry
                    </Button>
                </div>
            )}

            {!loading && !error && settingsDraft && (
                <>
                    <AffiliateSecondaryNav
                        activeTab={selectedTab}
                        onChange={handleAffiliateTabChange}
                        canSeeCashoutQueue={canSeeCashoutQueue}
                    />

                    <div
                        className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden"
                        style={paneInlineStyle}
                    >
                        {visibleTab === 'list' && (
                            <AffiliateListView
                                affiliates={affiliates}
                                canManage={canManage}
                                settingsDraft={settingsDraft}
                                priceRules={priceRules}
                                previewBasePricePesos={previewBasePricePesos}
                                rateEdits={rateEdits}
                                setRateEdits={setRateEdits}
                                rowBusyId={rowBusyId}
                                qrByEnrollment={qrByEnrollment}
                                affiliateRuleDrafts={affiliateRuleDrafts}
                                setAffiliateRuleDrafts={setAffiliateRuleDrafts}
                                affiliateRuleBusyId={affiliateRuleBusyId}
                                expandedRuleEnrollmentId={expandedRuleEnrollmentId}
                                onToggleAffiliateRuleEditor={handleToggleAffiliateRuleEditor}
                                onClearAffiliateRule={handleClearAffiliateRule}
                                onSaveAffiliateRule={handleSaveAffiliateRule}
                                onSaveRate={handleSaveRate}
                                onToggleQr={handleToggleQr}
                                onStatusChange={handleStatusChange}
                                onReactivate={handleReactivate}
                                onOpenInvite={() => setInviteDialogOpen(true)}
                                invites={invites}
                                inviteBusyId={inviteBusyId}
                                onCancelInvite={handleCancelInvite}
                            />
                        )}

                        {visibleTab === 'cashout' && canSeeCashoutQueue && (
                            <AffiliateCashoutView
                                cashouts={cashouts}
                                affiliates={affiliates}
                                canApproveCashouts={canApproveCashouts}
                                canPayCashouts={canPayCashouts}
                                cashoutBusyId={cashoutBusyId}
                                payoutRefDrafts={payoutRefDrafts}
                                setPayoutRefDrafts={setPayoutRefDrafts}
                                rejectReasonDrafts={rejectReasonDrafts}
                                setRejectReasonDrafts={setRejectReasonDrafts}
                                onApprove={handleApproveCashout}
                                onMarkPaid={handleMarkCashoutPaid}
                                onReject={handleRejectCashout}
                            />
                        )}

                        {visibleTab === 'settings' && (
                            <AffiliateSettingsView
                                canManageSettings={canManageSettings}
                                settingsDraft={settingsDraft}
                                initialSettingsDraft={initialSettingsDraft}
                                setSettingsDraft={setSettingsDraft}
                                savingSettings={savingSettings}
                                templateRuleDraft={templateRuleDraft}
                                initialTemplateRuleDraft={initialTemplateRuleDraft}
                                setTemplateRuleDraft={setTemplateRuleDraft}
                                previewBasePricePesos={previewBasePricePesos}
                                setPreviewBasePricePesos={setPreviewBasePricePesos}
                                savingTemplateRule={savingTemplateRule}
                                onSaveAllSettings={handleSaveAllSettings}
                            />
                        )}
                    </div>

                    <AffiliateInviteDialog
                        open={inviteDialogOpen && canManage}
                        email={inviteEmail}
                        rate={inviteRate}
                        inviting={inviting}
                        onEmailChange={setInviteEmail}
                        onRateChange={setInviteRate}
                        onSubmit={handleInvite}
                        onClose={() => setInviteDialogOpen(false)}
                    />
                </>
            )}
        </div>
    );
}

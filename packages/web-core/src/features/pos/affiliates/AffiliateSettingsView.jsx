import { CheckCircle2, RotateCcw, Save, ShieldAlert, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AffiliatePriceRulePreview from './AffiliatePriceRulePreview.jsx';
import {
    AFFILIATE_SELLING_PRICE_RULE_TYPES,
    bpsToPercentString,
    centavosToPesoString,
    DISCOUNT_RULE_TYPES,
    pesoStringToCentavos,
    PRICE_RULE_TYPE_LABELS,
    RATE_BASED_RULE_TYPES
} from './affiliatePresentation.js';

const AFFILIATE_SETTINGS_ACTION_BUTTON_CLASS = 'h-10 min-w-0 w-full flex-1 justify-center rounded-lg px-3 text-[13px] font-extrabold whitespace-nowrap sm:w-44 sm:flex-none';

export default function AffiliateSettingsView({
    canManageSettings,
    settingsDraft,
    initialSettingsDraft,
    setSettingsDraft,
    savingSettings,
    templateRuleDraft,
    initialTemplateRuleDraft,
    setTemplateRuleDraft,
    previewBasePricePesos,
    setPreviewBasePricePesos,
    savingTemplateRule,
    onSaveAllSettings
}) {
    if (!settingsDraft) return null;

    const resetSettings = () => {
        if (!canManageSettings || !initialSettingsDraft) return;
        setSettingsDraft({ ...initialSettingsDraft });
    };

    const resetTemplateRule = () => {
        if (!canManageSettings || !initialTemplateRuleDraft) return;
        setTemplateRuleDraft({ ...initialTemplateRuleDraft });
    };

    const resetAll = () => {
        if (!canManageSettings) return;
        resetSettings();
        resetTemplateRule();
        setPreviewBasePricePesos('100');
    };

    const isSaving = savingSettings || savingTemplateRule;
    const previewRate = bpsToPercentString(settingsDraft.default_rate_bps) || '0';

    return (
        <div id="affiliate-panel-settings" role="tabpanel" aria-label="Affiliate settings" className="affiliate-settings-scroll-region dgfy-pos-scroll-region flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1">
            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-black leading-6 text-[#0F172A]">Affiliate Settings</h2>
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">
                                <Store aria-hidden="true" className="h-3.5 w-3.5" />
                                Tenant Default
                            </span>
                        </div>
                        <p className="mt-1 text-[13px] leading-5 text-slate-400">Configure commission rules, payout thresholds, and affiliate pricing.</p>
                    </div>

                    <div className="flex min-w-0 items-center justify-between gap-3 sm:max-w-[21rem] sm:shrink-0">
                        <div className="min-w-0 text-left sm:text-right">
                            <p className="text-[13px] font-bold leading-4 text-slate-600">Program status</p>
                            <p className="mt-1 text-[11px] leading-4 text-slate-400">Enable affiliate attribution across storefronts.</p>
                        </div>
                        <Switch
                            checked={settingsDraft.program_enabled === true}
                            disabled={!canManageSettings}
                            className={settingsDraft.program_enabled === true ? 'bg-[#1b4e8d] focus-visible:ring-[#1b4e8d]' : 'focus-visible:ring-[#1b4e8d]'}
                            onCheckedChange={(checked) => setSettingsDraft((previous) => ({ ...previous, program_enabled: checked === true }))}
                        />
                    </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-6 pt-5 lg:grid-cols-2 lg:gap-0">
                    <div className="min-w-0 lg:border-r lg:border-slate-100 lg:pr-6">
                        <div>
                            <h3 className="text-[15px] font-black leading-5 text-[#0F172A]">Program Settings</h3>
                            <p className="mt-1 text-[12px] leading-4 text-slate-400">Commission rates and payout configuration.</p>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-1.5">
                                <label htmlFor="affiliate-default-rate" className="text-[11px] font-bold leading-4 text-slate-600">Default commission rate (%)</label>
                                <div className="relative">
                                    <Input
                                        id="affiliate-default-rate"
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        disabled={!canManageSettings}
                                        value={bpsToPercentString(settingsDraft.default_rate_bps)}
                                        onChange={(event) => setSettingsDraft((previous) => ({ ...previous, default_rate_bps: Number.isFinite(Number(event.target.value)) ? Math.round(Number(event.target.value) * 100) : null }))}
                                        className="h-9 pr-9 text-[13px]"
                                    />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-slate-400">%</span>
                                </div>
                            </div>
                            <div className="min-w-0 space-y-1.5">
                                <label htmlFor="affiliate-min-cashout" className="text-[11px] font-bold leading-4 text-slate-600">Minimum cashout (₱)</label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-slate-400">₱</span>
                                    <Input
                                        id="affiliate-min-cashout"
                                        type="number"
                                        min="0"
                                        step="1"
                                        disabled={!canManageSettings}
                                        value={centavosToPesoString(settingsDraft.min_cashout_centavos)}
                                        onChange={(event) => setSettingsDraft((previous) => ({ ...previous, min_cashout_centavos: pesoStringToCentavos(event.target.value) }))}
                                        className="h-9 pl-9 text-[13px]"
                                    />
                                </div>
                            </div>
                            <div className="min-w-0 space-y-1.5 sm:col-span-2">
                                <label className="text-[11px] font-bold leading-4 text-slate-600">Commission calculation</label>
                                <Select
                                    value={settingsDraft.commission_type || 'PERCENTAGE_OF_BASE'}
                                    onValueChange={(value) => setSettingsDraft((previous) => ({ ...previous, commission_type: value }))}
                                    disabled={!canManageSettings}
                                >
                                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PERCENTAGE_OF_BASE">Percentage of Base Price</SelectItem>
                                        <SelectItem value="RESELLER_MARGIN">Reseller margin (affiliate keeps the price gap)</SelectItem>
                                        <SelectItem value="NONE">No commission</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="mt-5 flex min-w-0 items-center justify-between gap-4 border-t border-slate-100 pt-4">
                            <div className="min-w-0">
                                <p className="text-[13px] font-bold leading-4 text-slate-600">Allow self-serve enrollment</p>
                                <p className="mt-1 text-[11px] leading-4 text-slate-400">Allow autonomous registration via portal link.</p>
                            </div>
                            <Switch
                                checked={settingsDraft.auto_approve_enrollment === true}
                                disabled={!canManageSettings}
                                className={settingsDraft.auto_approve_enrollment === true ? 'bg-[#1b4e8d] focus-visible:ring-[#1b4e8d]' : 'focus-visible:ring-[#1b4e8d]'}
                                onCheckedChange={(checked) => setSettingsDraft((previous) => ({ ...previous, auto_approve_enrollment: checked === true }))}
                            />
                        </div>
                    </div>

                    <div className="min-w-0 lg:pl-6">
                        <div>
                            <h3 className="text-[15px] font-black leading-5 text-[#0F172A]">Selling Price</h3>
                            <p className="mt-1 text-[12px] leading-4 text-slate-400">Default buyer pricing through affiliate links. Can be overridden per affiliate.</p>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-1.5">
                                <label className="text-[11px] font-bold leading-4 text-slate-600">Pricing rule</label>
                                <Select
                                    value={templateRuleDraft.rule_type}
                                    onValueChange={(value) => setTemplateRuleDraft((previous) => ({ ...previous, rule_type: value, value: '' }))}
                                    disabled={!canManageSettings}
                                >
                                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {AFFILIATE_SELLING_PRICE_RULE_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>{PRICE_RULE_TYPE_LABELS[type]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="min-w-0 space-y-1.5">
                                <label htmlFor="affiliate-preview-base-price" className="text-[11px] font-bold leading-4 text-slate-600">Preview using Base (₱)</label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-slate-400">₱</span>
                                    <Input
                                        id="affiliate-preview-base-price"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={previewBasePricePesos}
                                        onChange={(event) => setPreviewBasePricePesos(event.target.value)}
                                        className="h-9 pl-9 text-[13px]"
                                    />
                                </div>
                            </div>
                            {templateRuleDraft.rule_type !== 'BASE_PRICE' && (
                                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                                    <label className="text-[11px] font-bold leading-4 text-slate-600">
                                        {RATE_BASED_RULE_TYPES.has(templateRuleDraft.rule_type) ? 'Percentage (%)' : 'Amount (₱)'}
                                    </label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step={RATE_BASED_RULE_TYPES.has(templateRuleDraft.rule_type) ? '0.1' : '1'}
                                        disabled={!canManageSettings}
                                        value={templateRuleDraft.value}
                                        onChange={(event) => setTemplateRuleDraft((previous) => ({ ...previous, value: event.target.value }))}
                                        className="h-9 text-[13px]"
                                    />
                                </div>
                            )}
                        </div>

                        {DISCOUNT_RULE_TYPES.has(templateRuleDraft.rule_type) && (
                            <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-[11px] leading-4 text-amber-800">
                                <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                An affiliate discount stacks with any active promo code. Commission is always calculated on the base price, so a discount and a promo code together reduce what you net more than either alone.
                            </p>
                        )}

                        <div className="mt-5 border-t border-slate-100 pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Estimated transaction breakdown</span>
                                <span className="rounded-md bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">Live preview ({previewRate}% rate)</span>
                            </div>
                            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                                <AffiliatePriceRulePreview
                                    variant="settings"
                                    draft={templateRuleDraft}
                                    basePricePesos={previewBasePricePesos}
                                    commissionType={settingsDraft.commission_type}
                                    commissionRateBps={settingsDraft.default_rate_bps}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-[11px] leading-4 text-slate-500">
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-500" />
                        Changes apply immediately to active affiliate links.
                    </p>
                    {canManageSettings && (
                        <div className="flex w-full gap-2 sm:w-auto">
                            <Button type="button" variant="outline" onClick={resetAll} className={`${AFFILIATE_SETTINGS_ACTION_BUTTON_CLASS} border-rose-300 bg-rose-50/40 text-rose-700 shadow-sm shadow-rose-100/70 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800`}>
                                <RotateCcw aria-hidden="true" className="mr-2 h-4 w-4" /> Reset All
                            </Button>
                            <Button type="button" onClick={onSaveAllSettings} disabled={isSaving} className={`${AFFILIATE_SETTINGS_ACTION_BUTTON_CLASS} bg-[#1A4E8D] text-white hover:bg-[#143F73}`}>
                                <Save aria-hidden="true" className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Settings'}
                            </Button>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

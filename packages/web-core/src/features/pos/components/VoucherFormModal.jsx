import React from 'react';
import { createPortal } from 'react-dom';
import {
  BadgePercent,
  BarChart3,
  CalendarClock,
  ListChecks,
  Plus,
  ShieldAlert,
  SlidersHorizontal,
  Ticket,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StorefrontSectionInfo from '../settings/StorefrontSectionInfo.jsx';
import PosDateRangeField from './PosDateRangeField.jsx';
import PosTimeRangeField from './PosTimeRangeField.jsx';
import { WEEKDAY_LABELS, peso, pesoStringToCentavos } from './voucherFormModel.js';

const VOUCHER_MODAL_CHECKBOX_CLASS = 'pos-voucher-checkbox';
const VOUCHER_MODAL_SELECT_CLASS = 'pos-voucher-form-select';
const VOUCHER_FORM_PLACEHOLDER_CLASS = 'placeholder:text-slate-400 placeholder:opacity-70';
const WEEKDAY_FULL_LABELS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

const FieldError = ({ message }) => (message ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{message}</p> : null);

export default function VoucherFormModal({
  form,
  canManage,
  formLoading,
  saving,
  fieldErrors,
  formError,
  redemptionStats,
  formDialogRef,
  formCloseButtonRef,
  savingRef,
  closeForm,
  handleVoucherKindChange,
  setForm,
  handleAddScope,
  availableScopeOptions,
  scopeTypeDraft,
  setScopeTypeDraft,
  scopeRefDraft,
  setScopeRefDraft,
  scopeCatalogLoading,
  resolveScopeLabel,
  handleRemoveScope,
  pricelistOptionsLoading,
  pricelistOptions,
  hasDraftPricelist,
  onNavigateToPricelists,
  handleSave
}) {
    const isEdit = Boolean(form.voucherId);
    const codeEditable = canManage && (!isEdit || (form.status === 'draft' && form.redeemedCount === 0));
    const formLocked = !canManage || form.status === 'archived';
    // #1334/Phase 245:
    const isDeliveryCampaign = form.voucherKind === 'delivery_campaign';

    const formModal = (
      <div
        className="pos-items-modal-overlay pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-700/30 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-vouchers-form-modal-title"
        tabIndex={-1}
        ref={formDialogRef}
        onClick={() => {
          if (!savingRef.current) closeForm();
        }}
      >
        <div
          className="pos-items-modal-panel pos-items-catalog-form-modal pos-items-mobile-sheet-panel pos-voucher-form-modal relative flex h-[calc(100dvh-1.5rem)] w-full max-w-[64rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:h-auto sm:max-h-[calc(100dvh-2rem)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pos-voucher-form-modal-header -mx-px -mt-px flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D] px-4 py-2.5 sm:flex-nowrap sm:gap-3 sm:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm ring-1 ring-[#C7DCF3]">
                <Ticket className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="pos-vouchers-form-modal-title" className="text-sm font-black text-white">
                  {isEdit ? 'Edit Voucher' : 'New Voucher'}
                </h2>
                <p className="mt-0.5 max-w-full break-words text-[10px] leading-3 text-blue-100">
                  {isEdit ? 'Update POS catalog voucher & redemption rules' : 'Create and configure POS catalog voucher & redemption rules'}
                </p>
              </div>
            </div>
            <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                ref={formCloseButtonRef}
                aria-label={`Close ${isEdit ? 'Edit' : 'New'} Voucher`}
                className="grid h-8 w-8 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1A4E8D]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="pos-items-modal-body pos-items-modal-scroll-region min-h-0 flex-1 overflow-y-auto bg-[#F8FAFC] px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">

          {/* #1494: read-only audit meta -- accountable creating/modifying officer. Never part of
              buildVoucherPayload's outgoing request body. */}
          {isEdit && (form.createdByUsername || form.updatedByUsername) && (
            <p className="pos-voucher-audit-meta max-w-full text-[11px] leading-tight text-slate-400 sm:leading-normal">
              {form.createdByUsername && (
                <span className="block max-w-full break-words sm:inline">
                  Created by {form.createdByUsername}
                  {form.createdAt && ` on ${new Date(form.createdAt).toLocaleDateString()}`}
                </span>
              )}
              {form.updatedByUsername && form.updatedAt && (
                <>
                  {form.createdByUsername && <span className="hidden sm:inline" aria-hidden="true"> · </span>}
                  <span className="block max-w-full break-words sm:inline">
                    Last modified by {form.updatedByUsername} on {new Date(form.updatedAt).toLocaleDateString()}
                  </span>
                </>
              )}
            </p>
          )}

        {formLoading && <p className="text-sm text-slate-500">Loading voucher...</p>}

        {!formLoading && (
          <>
            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{formError}</div>
            )}
            {form.status === 'archived' && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> Archived vouchers are read-only.
              </div>
            )}
            {!canManage && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> You have view-only access to vouchers.
              </div>
            )}

            <fieldset disabled={formLocked} className="space-y-3">
              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <Ticket className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Basics</h4>
                </div>

                {/* #1334/Phase 245 (plan §4.2): voucher_kind/benefit_class/benefit_target are never
                    raw enum pickers -- picking "Delivery campaign" here is the only control that
                    sets all three, so every rejectable server combination becomes unrepresentable
                    from this UI rather than merely validated (plan §6 Layer 1). Read-only once a
                    voucher exists (R8) -- converting an existing voucher's kind is out of scope. */}
                <div className="pos-voucher-form-field mb-3 space-y-1.5">
                  <div className="pos-voucher-form-label-row">
                    <Label className="text-xs font-semibold text-[#0F172A]">Voucher type <span className="text-rose-600" aria-hidden="true">*</span></Label>
                    {isEdit ? (
                      <StorefrontSectionInfo label="Voucher type" panelId="pos-vouchers-voucher-type-info" portal>
                        <p>Voucher type cannot be changed after the voucher is created.</p>
                      </StorefrontSectionInfo>
                    ) : null}
                  </div>
                  {isEdit ? (
                    <div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input type="radio" name="voucherKind" checked={form.voucherKind === 'promo_code'} disabled readOnly />
                          Promo code
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input type="radio" name="voucherKind" checked={form.voucherKind === 'delivery_campaign'} disabled readOnly />
                          Delivery campaign
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input type="radio" name="voucherKind" checked={form.voucherKind === 'promo_code'}
                          onChange={() => handleVoucherKindChange('promo_code')} />
                        Promo code
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input type="radio" name="voucherKind" checked={form.voucherKind === 'delivery_campaign'}
                          onChange={() => handleVoucherKindChange('delivery_campaign')} />
                        Delivery campaign
                      </label>
                    </div>
                  )}
                </div>

                <div className="pos-voucher-form-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="pos-voucher-form-field space-y-1">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-semibold text-[#0F172A]">Code <span className="text-rose-600" aria-hidden="true">*</span></Label>
                      {isEdit && !codeEditable ? (
                        <StorefrontSectionInfo label="Code" panelId="pos-vouchers-code-info" portal>
                          <p>Code is locked once a voucher leaves draft or has a redemption.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                      {!isEdit && form.voucherKind === 'delivery_campaign' && form.autoApply ? (
                        <StorefrontSectionInfo label="Code" panelId="pos-vouchers-code-info" portal>
                          <p>Suggested from the campaign name. Shoppers never type this code, but it still appears in reports.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    <Input
                      className={`h-8 text-xs uppercase ${VOUCHER_FORM_PLACEHOLDER_CLASS}`}
                      value={form.code}
                      maxLength={40}
                      disabled={!codeEditable}
                      placeholder="e.g. SUMMER15"
                      onChange={(e) => setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))}
                    />
                    <FieldError message={fieldErrors.code} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">
                      {form.voucherKind === 'delivery_campaign' ? 'Campaign name' : 'Title'} <span className="text-rose-600" aria-hidden="true">*</span>
                    </Label>
                    <Input
                      className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`}
                      value={form.title}
                      placeholder={form.voucherKind === 'delivery_campaign' ? 'e.g. Free delivery over ₱500' : 'e.g. Summer Sale 15% Off'}
                      onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                    />
                    <FieldError message={fieldErrors.title} />
                  </div>
                </div>

                <div className="pos-voucher-form-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="pos-voucher-form-field space-y-1">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-semibold text-[#0F172A]">Subtitle</Label>
                      <StorefrontSectionInfo label="Subtitle" panelId="pos-vouchers-subtitle-info" portal>
                        <p>Subtitle is saved with the voucher but is not displayed anywhere yet.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <Input className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.subtitle} placeholder="e.g. Save on your next order" onChange={(e) => setForm((current) => ({ ...current, subtitle: e.target.value }))} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-semibold text-[#0F172A]">Badge</Label>
                      <StorefrontSectionInfo label="Badge" panelId="pos-vouchers-badge-info" portal>
                        <p>Shown as the discount label once applied, if set. It falls back to the voucher title otherwise.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <Input className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.badge} placeholder="e.g. 15% OFF" onChange={(e) => setForm((current) => ({ ...current, badge: e.target.value }))} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-semibold text-[#0F172A]">Validity text</Label>
                      <StorefrontSectionInfo label="Validity text" panelId="pos-vouchers-validity-text-info" portal>
                        <p>Validity text is saved with the voucher but is not displayed anywhere yet.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <Input className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.validityText} placeholder="e.g. Valid for new customers" onChange={(e) => setForm((current) => ({ ...current, validityText: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <BadgePercent className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Benefit</h4>
                </div>

                {/* #1334/Phase 245 (plan §4.2/§4.3): benefit_class/benefit_target are implicit for a
                    delivery campaign -- always free_delivery/delivery, never a raw picker. Item-
                    voucher scopes and the percent/amount/fixed-price fields don't apply and are
                    never rendered here, so the three server-rejectable combinations (fixed_price
                    targeting delivery, auto_apply on a non-delivery target, auto_apply carrying
                    scopes) are unrepresentable from this branch of the form. */}
                {form.voucherKind === 'delivery_campaign' ? (
                  <>
                    <div className="pos-voucher-form-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="pos-voucher-form-field space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-semibold text-[#0F172A]">Waiver amount <span className="text-rose-600" aria-hidden="true">*</span></Label>
                        <div className="flex flex-wrap gap-4">
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <input type="radio" name="deliveryWaiverMode" checked={form.deliveryWaiverMode === 'whole'}
                              onChange={() => setForm((current) => ({ ...current, deliveryWaiverMode: 'whole', deliveryAmountOffPesos: '' }))} />
                            Waive the whole delivery fee
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <input type="radio" name="deliveryWaiverMode" checked={form.deliveryWaiverMode === 'partial'}
                              onChange={() => setForm((current) => ({ ...current, deliveryWaiverMode: 'partial' }))} />
                            Waive up to a set amount
                          </label>
                        </div>
                      </div>
                      {form.deliveryWaiverMode === 'partial' && (
                        <div className="pos-voucher-form-field space-y-1">
                          <Label className="text-xs font-semibold text-[#0F172A]">Waive up to (₱) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                          <Input type="number" min="0.01" step="0.01" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.deliveryAmountOffPesos}
                            placeholder="e.g. 50.00"
                            onChange={(e) => setForm((current) => ({ ...current, deliveryAmountOffPesos: e.target.value }))} />
                          <FieldError message={fieldErrors.delivery_amount_off_centavos} />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3">
                      <div className="flex items-center gap-1">
                        <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                          <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.autoApply} onCheckedChange={(checked) => setForm((current) => ({ ...current, autoApply: checked === true }))} />
                          Apply automatically -- shoppers get this without typing a code
                        </label>
                        <StorefrontSectionInfo label="Apply automatically" panelId="pos-vouchers-auto-apply-info" portal>
                          <p>
                            {form.autoApply
                              ? 'Applies automatically at storefront checkout once the order qualifies. The code is only used internally for reports and audit.'
                              : `When off, shoppers must enter the code${form.code ? ` "${form.code}"` : ''} at checkout, like a regular promo code.`}
                          </p>
                        </StorefrontSectionInfo>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                <div className="pos-voucher-form-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="pos-voucher-form-field space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Benefit type <span className="text-rose-600" aria-hidden="true">*</span></Label>
                    <Select value={form.benefitClass} onValueChange={(value) => setForm((current) => ({ ...current, benefitClass: value }))}>
                      <SelectTrigger className={`${VOUCHER_MODAL_SELECT_CLASS} h-8 w-full px-3 text-xs font-semibold`}>
                        <SelectValue placeholder="Choose a benefit type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent_off">Percent off</SelectItem>
                        <SelectItem value="amount_off">Amount off</SelectItem>
                        <SelectItem value="fixed_price">Fixed price</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.benefitClass === 'percent_off' && (
                    <>
                      <div className="pos-voucher-form-field space-y-1">
                        <Label className="text-xs font-semibold text-[#0F172A]">Percent off (%) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                        <Input type="number" min="0.01" max="100" step="0.01" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.percentOffPercent}
                          placeholder="e.g. 15"
                          onChange={(e) => setForm((current) => ({ ...current, percentOffPercent: e.target.value }))} />
                        <FieldError message={fieldErrors.percent_off_bps} />
                      </div>
                      <div className="pos-voucher-form-field space-y-1">
                        <Label className="text-xs font-semibold text-[#0F172A]">Max discount cap (₱)</Label>
                        <Input type="number" min="0" step="1" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.maxDiscountPesos}
                          placeholder="e.g. 100"
                          onChange={(e) => setForm((current) => ({ ...current, maxDiscountPesos: e.target.value }))} />
                      </div>
                    </>
                  )}
                  {form.benefitClass === 'amount_off' && (
                    <div className="pos-voucher-form-field space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Amount off (₱) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                      <Input type="number" min="0.01" step="0.01" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.amountOffPesos}
                        placeholder="e.g. 50.00"
                        onChange={(e) => setForm((current) => ({ ...current, amountOffPesos: e.target.value }))} />
                      <FieldError message={fieldErrors.amount_off_centavos} />
                    </div>
                  )}
                  {form.benefitClass === 'fixed_price' && form.fixedPriceSource === 'single' && (
                    <div className="pos-voucher-form-field space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Fixed price (₱) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                      <Input type="number" min="0" step="0.01" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.fixedUnitPricePesos}
                        placeholder="e.g. 299.00"
                        onChange={(e) => setForm((current) => ({ ...current, fixedUnitPricePesos: e.target.value }))} />
                      <FieldError message={fieldErrors.fixed_unit_price_centavos} />
                    </div>
                  )}
                  {form.benefitClass === 'fixed_price' && form.fixedPriceSource === 'pricelist' && (
                    <div className="pos-voucher-form-field space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Pricelist {pricelistOptionsLoading ? '(loading...)' : ''}</Label>
                      <Select value={form.pricelistId} onValueChange={(value) => setForm((current) => ({ ...current, pricelistId: value }))}>
                        <SelectTrigger className={`${VOUCHER_MODAL_SELECT_CLASS} h-8 w-full px-3 text-xs font-semibold`}>
                          <SelectValue placeholder="Select a pricelist (e.g. Wholesale)..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Select a pricelist...</SelectItem>
                          {pricelistOptions.map((option) => (
                            <SelectItem key={option.pricelist_id} value={String(option.pricelist_id)}>{option.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError message={fieldErrors.pricelist_id} />
                      {/* #736: was a dead-end ("...on the Pricelists tab first") -- Pricelists
                          isn't a tab anymore (#732 promoted it to its own top-level nav mode), and
                          this now navigates there directly instead of just naming where to go. */}
                      {pricelistOptions.length === 0 && !pricelistOptionsLoading && (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
                          {/* RF-6: a draft pricelist exists but isn't attachable yet -- distinct
                              copy from "you have none at all", per #736's own acceptance. */}
                          <p className="text-[11px] text-slate-500">
                            {hasDraftPricelist
                              ? 'You have a draft pricelist -- publish it to use it here.'
                              : 'No active pricelists yet.'}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 text-[11px]"
                            onClick={() => onNavigateToPricelists?.()}
                          >
                            {hasDraftPricelist ? 'Go to Pricelists' : 'Create a pricelist'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {form.benefitClass === 'fixed_price' && (
                  <div className="pos-voucher-form-field mt-3 space-y-1.5">
                    <Label className="text-xs font-semibold text-[#0F172A]">Price source</Label>
                    <div className="flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <input type="radio" name="fixedPriceSource" checked={form.fixedPriceSource === 'single'}
                          onChange={() => setForm((current) => ({ ...current, fixedPriceSource: 'single' }))} />
                        Single price for the whole scope
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <input type="radio" name="fixedPriceSource" checked={form.fixedPriceSource === 'pricelist'}
                          onChange={() => setForm((current) => ({ ...current, fixedPriceSource: 'pricelist' }))} />
                        Pricelist (a different price per item)
                      </label>
                    </div>
                  </div>
                )}

                {form.benefitClass === 'fixed_price' && form.fixedPriceSource === 'single' && (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3">
                    <FieldError message={fieldErrors.scopes} />
                    <div className="flex flex-wrap items-end gap-1.5">
                      <div className="pos-voucher-form-field space-y-1">
                        <div className="pos-voucher-form-label-row">
                          <Label className="text-[11px] font-semibold text-[#0F172A]">Scope type</Label>
                          <StorefrontSectionInfo label="Scope type" panelId="pos-vouchers-scope-info" portal>
                            <p>Fixed-price vouchers apply only to the items or folders selected here.</p>
                          </StorefrontSectionInfo>
                        </div>
                        <Select value={scopeTypeDraft} onValueChange={(value) => { setScopeTypeDraft(value); setScopeRefDraft(''); }}>
                          <SelectTrigger className={`${VOUCHER_MODAL_SELECT_CLASS} h-8 w-full px-3 text-xs font-semibold`}>
                            <SelectValue placeholder="Choose a scope type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="item">Item</SelectItem>
                            <SelectItem value="item_folder">Folder</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="pos-voucher-form-field flex-1 space-y-1">
                        <Label className="text-[11px] font-semibold text-[#0F172A]">
                          {scopeTypeDraft === 'item' ? 'Item' : 'Folder'} {scopeCatalogLoading ? '(loading...)' : ''}
                        </Label>
                        <Select value={scopeRefDraft} onValueChange={setScopeRefDraft}>
                          <SelectTrigger className={`${VOUCHER_MODAL_SELECT_CLASS} h-8 w-full px-3 text-xs font-semibold`}>
                            <SelectValue placeholder={scopeTypeDraft === 'item' ? 'Select an item...' : 'Select a folder...'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{scopeTypeDraft === 'item' ? 'Select an item...' : 'Select a folder...'}</SelectItem>
                            {availableScopeOptions.map((option) => (
                              <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={handleAddScope} disabled={!scopeRefDraft}>
                        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add
                      </Button>
                    </div>
                    {form.scopes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {form.scopes.map((scope) => (
                          <span key={`${scope.scope_type}-${scope.scope_ref_id}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                            {resolveScopeLabel(scope)}
                            <button type="button" onClick={() => handleRemoveScope(scope.scope_type, scope.scope_ref_id)} className="text-slate-400 hover:text-rose-600">
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                  </>
                )}
              </div>

              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Minimums &amp; limits</h4>
                </div>
                <div className="pos-voucher-form-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="pos-voucher-form-field space-y-1">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-semibold text-[#0F172A]">
                        {isDeliveryCampaign ? 'Minimum item subtotal (₱)' : 'Min spend (₱)'}
                      </Label>
                      {isDeliveryCampaign ? (
                        <StorefrontSectionInfo label="Minimum item subtotal" panelId="pos-vouchers-min-subtotal-info" portal>
                          <p>Free delivery applies when the items in the cart total at least this amount. The delivery fee itself does not count toward it.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    <Input type="number" min="0" step="1" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.minSpendPesos}
                      placeholder="e.g. 500"
                      onChange={(e) => setForm((current) => ({ ...current, minSpendPesos: e.target.value }))} />
                    <FieldError message={fieldErrors.min_spend_centavos} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-semibold text-[#0F172A]">
                        {isDeliveryCampaign ? 'Maximum item subtotal (₱)' : 'Max order value (₱)'}
                      </Label>
                      <StorefrontSectionInfo label="Maximum item subtotal" panelId="pos-vouchers-max-order-value-info" portal>
                        <p>Voucher redemption is refused above this amount. The delivery fee itself does not count toward it.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <Input type="number" min="0" step="1" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.maxOrderValuePesos}
                      placeholder="e.g. 5000"
                      onChange={(e) => setForm((current) => ({ ...current, maxOrderValuePesos: e.target.value }))} />
                    <FieldError message={fieldErrors.max_order_value_centavos} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Min quantity</Label>
                    <Input type="number" min="1" step="1" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.minQuantity}
                      placeholder="e.g. 2"
                      onChange={(e) => setForm((current) => ({ ...current, minQuantity: e.target.value }))} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Max redemptions</Label>
                    <Input type="number" min="1" step="1" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.maxRedemptions}
                      placeholder="e.g. 100"
                      onChange={(e) => setForm((current) => ({ ...current, maxRedemptions: e.target.value }))} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-semibold text-[#0F172A]">
                        {isDeliveryCampaign ? 'Campaign budget (₱)' : 'Max total discount budget (₱)'}
                      </Label>
                      {isDeliveryCampaign && form.autoApply ? (
                        <StorefrontSectionInfo label="Campaign budget" panelId="pos-vouchers-budget-info" portal>
                          <p>Stops auto-applying once the total waived delivery fees reach this amount.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    <Input type="number" min="0" step="1" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.maxTotalDiscountPesos}
                      placeholder="e.g. 1000"
                      onChange={(e) => setForm((current) => ({ ...current, maxTotalDiscountPesos: e.target.value }))} />
                  </div>
                  {/* A delivery waiver has no per-line quantity component -- hidden for a delivery
                      campaign (always sent as null, see buildVoucherPayload). */}
                  {!isDeliveryCampaign && (
                    <div className="pos-voucher-form-field space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Max benefit quantity</Label>
                      <Input type="number" min="1" step="1" className={`h-8 text-xs ${VOUCHER_FORM_PLACEHOLDER_CLASS}`} value={form.maxBenefitQuantity}
                        placeholder="e.g. 1"
                        onChange={(e) => setForm((current) => ({ ...current, maxBenefitQuantity: e.target.value }))} />
                    </div>
                  )}
                  <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 pb-1 sm:col-span-2 lg:col-span-3">
                    {/* Item-COGS guard (#697) -- no meaning against a delivery fee, hidden for a
                        delivery campaign. */}
                    {!isDeliveryCampaign && (
                      <label className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-[#0F172A]">
                        <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.allowBelowCost} onCheckedChange={(checked) => setForm((current) => ({ ...current, allowBelowCost: checked === true }))} />
                        Allow selling below cost
                      </label>
                    )}
                    {/* #734: 'Stackable with statutory discounts' removed -- the stored
                        stackable_with_statutory column had zero policy readers anywhere in the
                        codebase and, if actually wired up, would contradict ADR 0066 Decision 8
                        (a single governed discount slot per POS transaction). Whether a
                        fixed-price voucher may combine with the statutory Senior/PWD 20% is an
                        open policy question tracked in #605 -- that's where this gets decided,
                        not here. Form state/mapper/submit payload below are left untouched so the
                        API contract and an existing voucher's stored value round-trip unchanged
                        (always sends stackable_with_statutory: false for a new voucher). */}
                    {/* R6 (plan §4.3/§9, open question -- see the PR body): advertising a card for a
                        code nobody needs to type is, at best, an unaudited storefront-discovery
                        interaction -- forced off for auto-apply campaigns in v1. Still offered for
                        a code-entered delivery campaign and for every promo code, unchanged. */}
                    {!(isDeliveryCampaign && form.autoApply) && (
                      <label className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-[#0F172A]">
                        <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.isPubliclyListed} onCheckedChange={(checked) => setForm((current) => ({ ...current, isPubliclyListed: checked === true }))} />
                        List on public storefront
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* #788 (Phase 269): account-restricted issuance. Its own card rather than a field in
                  "Eligibility" above, because it answers a different question -- every control up
                  there narrows WHEN or WHERE a shared code works; this one narrows WHO may use it at
                  all, which is the one restriction that changes what the code fundamentally is.
                  A plain textarea of account IDs, not a picker: a DGFY account that has never
                  ordered from this store has no tenant-local row to search, and that unshopped B2B
                  account is exactly the case #788 exists for. An email->ID lookup is a real UX gap,
                  named in the PR body rather than papered over. */}
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Account restriction (optional)</h4>
                <div className="pos-voucher-form-field space-y-1">
                  <Label className="text-xs font-semibold text-[#0F172A]">Restrict to specific DGFY accounts</Label>
                  <textarea
                    value={form.accountGrantIdsText}
                    onChange={(event) => setForm((current) => ({ ...current, accountGrantIdsText: event.target.value }))}
                    rows={3}
                    spellCheck={false}
                    placeholder={'e.g. 1024\n2048 — one account ID per line'}
                    className={`mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 ${VOUCHER_FORM_PLACEHOLDER_CLASS}`}
                  />
                  <FieldError message={fieldErrors.account_grant_ids} />
                  <p className="text-[11px] leading-snug text-slate-500">
                    Leave blank for a shared code. When set, only these accounts may redeem it, and
                    only on the storefront while signed in — a guest checkout is refused, and POS
                    cannot redeem it at all (a terminal captures a customer name, not an account).
                    An account-restricted voucher also cannot be listed on the public storefront.
                  </p>
                </div>
              </div>

              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Validity window</h4>
                </div>
                <div className="pos-voucher-form-grid grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="pos-voucher-form-field sm:col-span-2 lg:col-span-2">
                    <Label htmlFor="pos-voucher-validity-range" className="text-[11px] font-semibold text-[#0F172A]">Validity dates</Label>
                    <PosDateRangeField
                      id="pos-voucher-validity-range"
                      from={form.validFrom}
                      to={form.validUntil}
                      onChange={(nextFrom, nextUntil) => setForm((current) => ({
                        ...current,
                        validFrom: nextFrom,
                        validUntil: nextUntil
                      }))}
                      title="Select validity dates"
                      description="Select one date for a one-day voucher or two dates for a validity range."
                      openLabel="Open validity dates calendar"
                      placeholder="MM/DD/YYYY"
                      compact
                      layerClassName="z-[10000]"
                    />
                    <FieldError message={fieldErrors.valid_from || fieldErrors.valid_until} />
                  </div>
                  <div className="pos-voucher-form-field sm:col-span-2 lg:col-span-2">
                    <Label htmlFor="pos-voucher-time-range" className="text-[11px] font-semibold text-[#0F172A]">Daily time window</Label>
                    <PosTimeRangeField
                      id="pos-voucher-time-range"
                      start={form.validTimeStart}
                      end={form.validTimeEnd}
                      onChange={(nextStart, nextEnd) => setForm((current) => ({
                        ...current,
                        validTimeStart: nextStart,
                        validTimeEnd: nextEnd
                      }))}
                      title="Select daily time window"
                      description="Choose when this voucher can be redeemed each day."
                      openLabel="Open daily time window"
                      startPlaceholder="e.g. 09:00 AM"
                      endPlaceholder="e.g. 06:00 PM"
                      compact
                      layerClassName="z-[10000]"
                    />
                    <FieldError message={fieldErrors.valid_time_start || fieldErrors.valid_time_end} />
                  </div>
                </div>
                <div className="pos-voucher-form-field mt-2.5 space-y-1">
                  <Label className="text-[11px] font-semibold text-[#0F172A]">Days of the week</Label>
                  <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-7 pos-voucher-weekday-grid">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <label key={label} className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[#0F172A] pos-voucher-weekday-option">
                        <Checkbox
                          className={VOUCHER_MODAL_CHECKBOX_CLASS}
                          checked={form.weekdayFlags[index]}
                          onCheckedChange={(checked) => setForm((current) => ({
                            ...current,
                            weekdayFlags: current.weekdayFlags.map((flag, i) => (i === index ? checked === true : flag))
                          }))}
                        />
                        <span className="truncate">{WEEKDAY_FULL_LABELS[index] || label}</span>
                      </label>
                    ))}
                  </div>
                  <FieldError message={fieldErrors.weekday_mask} />
                </div>
              </div>

              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <ListChecks className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Eligibility</h4>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-4 lg:gap-x-8 pos-voucher-eligibility-grid">
                  <div className="pos-voucher-form-field space-y-1.5 pos-voucher-eligibility-group">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-bold tracking-wide text-[#0F172A] pos-voucher-eligibility-label">Channels</Label>
                      {isDeliveryCampaign && form.autoApply ? (
                        <StorefrontSectionInfo label="Channels" panelId="pos-vouchers-channels-info" portal>
                          <p>Auto-applied campaigns only ever fire at storefront checkout.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    {/* R2: auto_apply only ever fires from storefront checkout
                        (storeUseCases.js's resolveCheckoutContext) -- a merchant who unchecked
                        Storefront on an auto-apply campaign would author something that can never
                        fire, and nothing server-side rejects a channels_mask that omits it. Locked
                        on, POS hidden, whenever auto-apply is on. */}
                    <div className="block max-sm:grid max-sm:grid-cols-2 max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1.5 sm:block sm:space-y-1 pos-voucher-eligibility-options">
                      {isDeliveryCampaign && form.autoApply ? (
                        <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                          <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked disabled />
                          Storefront
                        </label>
                      ) : (
                        <>
                          <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                            <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.channelFlags.storefront} onCheckedChange={(checked) => setForm((current) => ({ ...current, channelFlags: { ...current.channelFlags, storefront: checked === true } }))} />
                            Storefront
                          </label>
                          <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                            <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.channelFlags.pos} onCheckedChange={(checked) => setForm((current) => ({ ...current, channelFlags: { ...current.channelFlags, pos: checked === true } }))} />
                            POS
                          </label>
                        </>
                      )}
                    </div>
                    <FieldError message={fieldErrors.channels_mask} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1.5 pos-voucher-eligibility-group">
                    <div className="pos-voucher-form-label-row">
                      <Label className="text-xs font-bold tracking-wide text-[#0F172A] pos-voucher-eligibility-label">Fulfillment methods</Label>
                      {isDeliveryCampaign ? (
                        <StorefrontSectionInfo label="Fulfillment methods" panelId="pos-vouchers-fulfillment-info" portal>
                          <p>Delivery campaigns only apply to delivery orders.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    {/* R3: a pickup order has no delivery fee -- the pickup bit is a guaranteed
                        no-op for a delivery campaign, so it's locked to delivery-only rather than
                        offered as a free triad (plan §4.5). */}
                    <div className="block max-sm:grid max-sm:grid-cols-2 max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1.5 sm:block sm:space-y-1 pos-voucher-eligibility-options">
                      {isDeliveryCampaign ? (
                        <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                          <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked disabled />
                          Delivery
                        </label>
                      ) : (
                        <>
                          <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                            <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.fulfillmentFlags.delivery} onCheckedChange={(checked) => setForm((current) => ({ ...current, fulfillmentFlags: { ...current.fulfillmentFlags, delivery: checked === true } }))} />
                            Delivery
                          </label>
                          <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                            <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.fulfillmentFlags.pickup} onCheckedChange={(checked) => setForm((current) => ({ ...current, fulfillmentFlags: { ...current.fulfillmentFlags, pickup: checked === true } }))} />
                            Pickup
                          </label>
                        </>
                      )}
                    </div>
                    <FieldError message={fieldErrors.fulfillment_methods_mask} />
                  </div>
                  <div className="pos-voucher-form-field space-y-1.5 pos-voucher-eligibility-group">
                    <Label className="text-xs font-bold tracking-wide text-[#0F172A] pos-voucher-eligibility-label">Order timing</Label>
                    <div className="block max-sm:grid max-sm:grid-cols-2 max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1.5 sm:block sm:space-y-1 pos-voucher-eligibility-options">
                      <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                        <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.orderTimingFlags.asap} onCheckedChange={(checked) => setForm((current) => ({ ...current, orderTimingFlags: { ...current.orderTimingFlags, asap: checked === true } }))} />
                        ASAP
                      </label>
                      <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                        <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.orderTimingFlags.scheduled} onCheckedChange={(checked) => setForm((current) => ({ ...current, orderTimingFlags: { ...current.orderTimingFlags, scheduled: checked === true } }))} />
                        Scheduled
                      </label>
                    </div>
                    <FieldError message={fieldErrors.order_timings_mask} />
                  </div>
                </div>
              </div>

              {/* #1334/Phase 245 (plan §5.2): GET /vouchers/:id already returns redemption_stats
                  unconditionally -- for a delivery campaign, show the LEDGER figures
                  (redemption_count / total_discount_centavos), not the cached redeemed_* columns
                  the promo-code block below still uses. ADR 0066 Decision 4 makes the ledger
                  authoritative; cache_in_sync is deliberately never surfaced here -- it's EXPECTED
                  false once reversal rows exist (Phase 243), so showing it would be a permanent
                  false alarm (voucherUseCases.js's own buildRedemptionStats comment). */}
              {isEdit && isDeliveryCampaign && (
                <div className="rounded-lg border border-[#D9E4F2] bg-[#F8FAFC] p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <BarChart3 className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Campaign performance (read-only)</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-slate-500">Redemptions</span>
                      <p className="font-bold text-[#0F172A]">{redemptionStats?.redemption_count ?? 0}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Delivery fees waived</span>
                      <p className="font-bold text-[#0F172A]">{peso(redemptionStats?.total_discount_centavos ?? 0)}</p>
                      <p className="text-[11px] text-slate-400">Net of cancelled orders</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Last redeemed</span>
                      <p className="font-bold text-[#0F172A]">
                        {redemptionStats?.last_redeemed_at ? new Date(redemptionStats.last_redeemed_at).toLocaleString() : 'Never'}
                      </p>
                    </div>
                    {form.maxTotalDiscountPesos !== '' && (
                      <div>
                        <span className="text-slate-500">Budget remaining</span>
                        <p className="font-bold text-[#0F172A]">
                          {peso(Math.max(0, pesoStringToCentavos(form.maxTotalDiscountPesos) - (redemptionStats?.total_discount_centavos ?? 0)))}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isEdit && !isDeliveryCampaign && (
                <div className="rounded-lg border border-[#D9E4F2] bg-[#F8FAFC] p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <ListChecks className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Redemptions (read-only)</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-slate-500">Redeemed</span><p className="font-bold text-[#0F172A]">{form.redeemedCount}</p></div>
                    <div><span className="text-slate-500">Discount value</span><p className="font-bold text-[#0F172A]">{peso(form.redeemedValueCentavos)}</p></div>
                    <div><span className="text-slate-500">Benefit quantity</span><p className="font-bold text-[#0F172A]">{form.redeemedQuantity}</p></div>
                  </div>
                </div>
              )}

            </fieldset>
          </>
        )}
      </div>
          {!formLoading && canManage && form.status !== 'archived' && (
            <div className="pos-voucher-form-modal-footer grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4">
              <Button type="button" variant="outline" onClick={closeForm} disabled={saving} className="h-10 min-w-0 w-full rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50">
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving} className="h-10 min-w-0 w-full rounded-lg bg-[#1A4E8D] px-2 text-[11px] font-bold text-white hover:bg-[#143F73]">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Voucher'}
              </Button>
            </div>
          )}
        </div>
      </div>
    );

    return typeof document !== 'undefined' ? createPortal(formModal, document.body) : formModal;
}

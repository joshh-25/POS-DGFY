import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Pencil, Plus, Store, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDeliveryPartnerLogo } from '../../../utils/deliveryPartnerAssets.js';
import { STOREFRONT_TYPOGRAPHY, StorefrontEmptyState, StorefrontSectionHeader } from './StorefrontSectionPrimitives.jsx';
import { POS_MODAL_HEADER_SURFACE_CLASS } from '../components/posModalStyles.js';

export const MAX_STOREFRONT_DELIVERY_PARTNERS = 4;
export const STOREFRONT_DELIVERY_PARTNER_OPTIONS = [
  { id: 'grab', label: 'Grab', mark: 'Grab', className: 'bg-emerald-600 text-white' },
  { id: 'foodpanda', label: 'foodpanda', mark: 'fp', className: 'bg-pink-600 text-white' },
  { id: 'lalamove', label: 'Lalamove', mark: 'L', className: 'bg-orange-500 text-white' },
  { id: 'custom', label: 'Custom', mark: '•', className: 'bg-slate-700 text-white' }
];

const supportedPartnerIds = new Set(STOREFRONT_DELIVERY_PARTNER_OPTIONS.map(({ id }) => id));

const normalizePartners = (value, maxPartners = MAX_STOREFRONT_DELIVERY_PARTNERS) => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.map((entry) => {
    const isLegacyString = typeof entry === 'string';
    const partner = String(isLegacyString ? entry : entry?.partner || '').trim().toLowerCase();
    if (!supportedPartnerIds.has(partner) || seen.has(partner)) return null;
    const label = isLegacyString ? '' : String(entry?.label || '').trim().slice(0, 60);
    const url = isLegacyString ? '' : String(entry?.url || '').trim().slice(0, 255);
    // The settings form used to seed a blank Grab object. It is not a configured partner.
    if (!isLegacyString && !label && !url) return null;
    seen.add(partner);
    return { partner, label, url };
  }).filter(Boolean).slice(0, maxPartners);
};

const getDefinition = (partner) => STOREFRONT_DELIVERY_PARTNER_OPTIONS.find(({ id }) => id === partner) || STOREFRONT_DELIVERY_PARTNER_OPTIONS[3];
const getPartnerName = (entry) => String(entry?.label || '').trim() || getDefinition(entry?.partner).label;

const isValidUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

function PartnerLogo({ partner, size = 'h-10 w-10' }) {
  const definition = getDefinition(partner);
  const logoSrc = getDeliveryPartnerLogo(partner);
  const className = logoSrc
    ? `grid ${size} shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-white`
    : `grid ${size} shrink-0 place-items-center rounded-md ${definition.id === 'foodpanda' ? 'text-[11px]' : 'text-[13px]'} font-extrabold tracking-tight ${definition.className}`;
  return (
    <span className={className} role="img" aria-label={`${definition.label} logo`}>
      {logoSrc ? <img src={logoSrc} alt="" className="h-full w-full object-contain" aria-hidden="true" /> : definition.mark}
    </span>
  );
}

function DeliveryPartnerModal({ title, children, onClose, labelledBy }) {
  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="w-full max-w-md overflow-hidden rounded-2xl border border-[#D9E5F3] bg-white shadow-2xl shadow-slate-950/15">
        <div className={['flex items-center justify-between rounded-t-2xl px-4 py-3', POS_MODAL_HEADER_SURFACE_CLASS].join(' ')}>
          <h3 id={labelledBy} className="text-[14px] font-extrabold text-[#0F172A]">{title}</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`} className="h-8 w-8 rounded-lg text-[#536B8C] hover:bg-slate-100"><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PartnerRow({ entry, index, menuOpen, editing, draft, setDraft, partners, disabled, onToggleMenu, onEdit, onCancelEdit, onSaveEdit, onRemove }) {
  return (
    <div role="listitem" aria-label={`${getPartnerName(entry)} delivery partner`} className="h-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="relative flex min-w-0 items-center gap-3">
        <PartnerLogo partner={entry.partner} />
        <div className="min-w-0 flex-1">
          <p className={`truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`}>{getPartnerName(entry)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onToggleMenu(index)}
          disabled={disabled}
          aria-label={`${getPartnerName(entry)} actions`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Partner actions"
          className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white text-[#1A4E8D] hover:bg-blue-50 focus-visible:ring-[#1A4E8D]"
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
        {menuOpen ? (
          <div role="menu" aria-label={`Actions for ${getPartnerName(entry)}`} className="absolute right-3 top-12 z-30 w-36 rounded-lg border border-slate-200 bg-white p-1.5 text-left shadow-lg">
            <button type="button" role="menuitem" onClick={() => onEdit(index)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-[12px] font-semibold text-[#0F172A] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"><Pencil className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" />Edit</button>
            <button type="button" role="menuitem" onClick={() => onRemove(index)} className="flex min-h-9 w-full items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remove</button>
          </div>
        ) : null}
      </div>
      {editing ? <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/30 p-3" aria-label={`Edit ${getPartnerName(entry)}`}><PartnerForm mode="edit" draft={draft} setDraft={setDraft} partners={partners} onCancel={onCancelEdit} onSubmit={onSaveEdit} /></div> : null}
    </div>
  );
}

function PartnerForm({ mode, draft, setDraft, partners, onCancel, onSubmit }) {
  const isEdit = mode === 'edit';
  const duplicate = !isEdit && partners.some((entry) => entry.partner === draft.partner);
  const partnerError = !draft.partner ? 'Select a delivery partner.' : duplicate ? 'This partner has already been added.' : '';
  const customNameError = draft.partner === 'custom' && !draft.label.trim() ? 'Enter a partner name.' : '';
  const urlError = !draft.url.trim() ? 'Partner link is required.' : !isValidUrl(draft.url) ? 'Enter a valid URL.' : '';
  const valid = !partnerError && !customNameError && !urlError;

  return (
    <div className="space-y-3 px-4 py-4">
      {isEdit ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <PartnerLogo partner={draft.partner} />
          <div className="min-w-0"><p className={STOREFRONT_TYPOGRAPHY.itemLabel}>{getPartnerName(draft)}</p><p className={STOREFRONT_TYPOGRAPHY.helper}>Delivery partner</p></div>
        </div>
      ) : (
        <div>
          <Label htmlFor="delivery-partner-select" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Delivery Partner <span className="text-rose-600">*</span></Label>
          <select id="delivery-partner-select" value={draft.partner} onChange={(event) => setDraft((current) => ({ ...current, partner: event.target.value, label: event.target.value === 'custom' ? current.label : '' }))} className={`mt-1 h-9 w-full rounded-lg border bg-white px-2.5 text-[13px] text-[#0F172A] outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 ${partnerError ? 'border-rose-300' : 'border-slate-200'}`} aria-invalid={Boolean(partnerError)}>
            <option value="" disabled>Select a delivery partner</option>
            {STOREFRONT_DELIVERY_PARTNER_OPTIONS.map((option) => <option key={option.id} value={option.id} disabled={partners.some((entry) => entry.partner === option.id)}>{option.label}{partners.some((entry) => entry.partner === option.id) ? ' (already added)' : ''}</option>)}
          </select>
          {partnerError ? <p className="mt-1 text-[11px] font-semibold leading-4 text-rose-600" role="alert">{partnerError}</p> : null}
        </div>
      )}
      {draft.partner === 'custom' ? (
        <div>
          <Label htmlFor="delivery-partner-name" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Partner Name <span className="text-rose-600">*</span></Label>
          <Input id="delivery-partner-name" value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value.slice(0, 60) }))} maxLength={60} placeholder="Enter partner name" aria-invalid={Boolean(customNameError)} className={`mt-1 h-9 rounded-lg border-slate-200 text-[13px] ${customNameError ? 'border-rose-300 focus-visible:border-rose-500 focus-visible:ring-rose-500' : ''}`} />
          {customNameError ? <p className="mt-1 text-[11px] font-semibold leading-4 text-rose-600" role="alert">{customNameError}</p> : null}
        </div>
      ) : null}
      <div>
        <Label htmlFor="delivery-partner-link" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Partner Link <span className="text-rose-600">*</span></Label>
        <Input id="delivery-partner-link" type="url" inputMode="url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value.slice(0, 255) }))} maxLength={255} placeholder="https://..." aria-invalid={Boolean(urlError)} className={`mt-1 h-9 rounded-lg border-slate-200 text-[13px] ${urlError ? 'border-rose-300 focus-visible:border-rose-500 focus-visible:ring-rose-500' : ''}`} />
        {urlError ? <p className="mt-1 text-[11px] font-semibold leading-4 text-rose-600" role="alert">{urlError}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="outline" onClick={onCancel} className="min-h-9 rounded-lg border-slate-200 px-3 text-[12px] font-bold text-[#0F172A]">Cancel</Button>
        <Button type="button" onClick={() => onSubmit({ partner: draft.partner, label: draft.partner === 'custom' ? draft.label.trim() : '', url: draft.url.trim() })} disabled={!valid} className="min-h-9 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]">{isEdit ? 'Save Changes' : 'Add Partner'}</Button>
      </div>
    </div>
  );
}

export default function StorefrontDeliveryPartnersSettings({ partners = [], onChange, disabled = false, maxPartners = MAX_STOREFRONT_DELIVERY_PARTNERS }) {
  const entries = useMemo(() => normalizePartners(partners, maxPartners), [partners, maxPartners]);
  const [menuIndex, setMenuIndex] = useState(null);
  const [modal, setModal] = useState(null);
  const [draft, setDraft] = useState({ partner: '', label: '', url: '' });
  const [announcement, setAnnouncement] = useState('');
  const atMaximum = entries.length >= maxPartners;

  const emit = (nextEntries) => onChange?.(normalizePartners(nextEntries, maxPartners));
  const openAdd = () => { if (!disabled && !atMaximum) { setMenuIndex(null); setDraft({ partner: '', label: '', url: '' }); setModal('add'); } };
  const openEdit = (index) => { setMenuIndex(null); setDraft({ ...entries[index] }); setModal({ type: 'edit', index }); };
  const openRemove = (index) => { setMenuIndex(null); setModal({ type: 'remove', index }); };
  const submitForm = (value) => {
    if (modal === 'add') { emit([...entries, value]); setAnnouncement(`${getPartnerName(value)} added.`); }
    else if (modal?.type === 'edit') { emit(entries.map((entry, index) => (index === modal.index ? value : entry))); setAnnouncement(`${getPartnerName(value)} updated.`); }
    setModal(null);
  };
  const removePartner = () => {
    if (modal?.type !== 'remove') return;
    const removed = entries[modal.index];
    emit(entries.filter((_, index) => index !== modal.index));
    setAnnouncement(`${getPartnerName(removed)} removed.`);
    setModal(null);
  };

  const modalContent = (
    <>
      {modal === 'add' ? <DeliveryPartnerModal title="Add Delivery Partner" labelledBy="add-delivery-partner-heading" onClose={() => setModal(null)}><PartnerForm mode="add" draft={draft} setDraft={setDraft} partners={entries} onCancel={() => setModal(null)} onSubmit={submitForm} /></DeliveryPartnerModal> : null}
      {modal?.type === 'remove' ? (
        <DeliveryPartnerModal title="Remove Delivery Partner" labelledBy="remove-delivery-partner-heading" onClose={() => setModal(null)}>
          <div className="px-4 py-5 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-rose-50 text-rose-600"><Trash2 className="h-5 w-5" aria-hidden="true" /></span><p className="mt-3 text-[13px] font-extrabold text-[#0F172A]">Are you sure you want to remove “{getPartnerName(entries[modal.index])}”?</p><p className="mt-1 text-[11px] leading-4 text-[#64748B]">It will no longer appear on your storefront.</p><div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3"><Button type="button" variant="outline" onClick={() => setModal(null)} className="min-h-9 rounded-lg border-slate-200 px-3 text-[12px] font-bold text-[#0F172A]">Cancel</Button><Button type="button" onClick={removePartner} className="min-h-9 rounded-lg bg-rose-600 px-3 text-[12px] font-extrabold text-white hover:bg-rose-700">Remove</Button></div></div>
        </DeliveryPartnerModal>
      ) : null}
    </>
  );

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-labelledby="storefront-delivery-partners-heading">
      <StorefrontSectionHeader
        title="Delivery Partners"
        titleId="storefront-delivery-partners-heading"
        description="Show the delivery partners available for your store."
        info={atMaximum ? <><p className="font-extrabold text-[#0F172A]">You have reached the maximum of {maxPartners} delivery partners.</p><p className="mt-1">Remove a partner to add a new one.</p></> : <><p className="font-extrabold text-[#0F172A]">You can add up to {maxPartners} delivery partners.</p><p className="mt-1">Added partners are automatically shown on your storefront.</p></>}
        infoLabel="Delivery Partners"
        infoPanelId="storefront-delivery-partners-guidance"
        hasData={entries.length > 0}
        action={<Button type="button" onClick={openAdd} disabled={disabled || atMaximum} aria-label={atMaximum ? `Add delivery partner (maximum of ${maxPartners} reached)` : 'Add delivery partner'} title={atMaximum ? `Maximum of ${maxPartners} delivery partners reached` : 'Add delivery partner'} className="min-h-9 w-full gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:text-[13px]"><Plus className="h-4 w-4" aria-hidden="true" />Add Delivery Partner</Button>}
        actionNote={atMaximum ? <span className="text-right text-[11px] font-semibold text-[#64748B]">Maximum of {maxPartners} delivery partners reached.</span> : null}
      />

      {entries.length > 0 ? (
        <div className="mt-4 grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2.5" role="list" aria-label="Storefront delivery partners">
          {entries.map((entry, index) => <PartnerRow key={`${entry.partner}-${index}`} entry={entry} index={index} menuOpen={menuIndex === index} editing={modal?.type === 'edit' && modal.index === index} draft={draft} setDraft={setDraft} partners={entries} disabled={disabled} onToggleMenu={(nextIndex) => setMenuIndex((current) => current === nextIndex ? null : nextIndex)} onEdit={openEdit} onCancelEdit={() => setModal(null)} onSaveEdit={submitForm} onRemove={openRemove} />)}
        </div>
      ) : (
        <StorefrontEmptyState
          className="mt-4"
          icon={Store}
          title="No delivery partners added yet."
          description="Add delivery partners to show customers your available delivery options."
          action={<Button type="button" onClick={openAdd} disabled={disabled} aria-label="Add delivery partner" className="mt-3 min-h-9 gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]"><Plus className="h-4 w-4" aria-hidden="true" />Add Delivery Partner</Button>}
        />
      )}

      <p className="sr-only" aria-live="polite">{announcement}</p>
      {typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent}
    </section>
  );
}

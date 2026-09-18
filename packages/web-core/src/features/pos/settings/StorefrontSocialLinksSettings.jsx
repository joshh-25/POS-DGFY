import React, { useMemo, useState } from 'react';
import { Facebook, Instagram, Link2, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STOREFRONT_TYPOGRAPHY, StorefrontEmptyState, StorefrontSectionHeader } from './StorefrontSectionPrimitives.jsx';

export const STOREFRONT_SOCIAL_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', Icon: Facebook, placeholder: 'https://facebook.com/yourpage' },
  { id: 'instagram', label: 'Instagram', Icon: Instagram, placeholder: 'https://instagram.com/yourpage' },
  { id: 'messenger', label: 'Messenger', Icon: MessageCircle, placeholder: 'https://m.me/yourpage' }
];
export const MAX_STOREFRONT_SOCIAL_LINKS = STOREFRONT_SOCIAL_PLATFORMS.length;

const normalizeSocialLinks = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => ({ platform: String(entry?.platform || '').trim().toLowerCase(), url: String(entry?.url || '') }))
      .filter((entry) => STOREFRONT_SOCIAL_PLATFORMS.some((platform) => platform.id === entry.platform))
      .slice(0, MAX_STOREFRONT_SOCIAL_LINKS);
  }
  if (!value || typeof value !== 'object') return [];
  return STOREFRONT_SOCIAL_PLATFORMS
    .map(({ id }) => ({ platform: id, url: String(value[id] || '') }))
    .filter((entry) => entry.url.trim());
};

const toSocialLinksObject = (entries) => STOREFRONT_SOCIAL_PLATFORMS.reduce((result, { id }) => {
  const entry = entries.find((candidate) => candidate.platform === id);
  result[id] = entry?.url || '';
  return result;
}, {});

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

function PlatformIcon({ platform }) {
  const definition = STOREFRONT_SOCIAL_PLATFORMS.find((entry) => entry.id === platform);
  const Icon = definition?.Icon || Link2;
  return <Icon className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />;
}

function SocialLinkPreview({ entry, normalizedUrl }) {
  const label = STOREFRONT_SOCIAL_PLATFORMS.find((platform) => platform.id === entry.platform)?.label || 'Social link';
  const content = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-blue-100 bg-blue-50" aria-hidden="true"><PlatformIcon platform={entry.platform} /></span>
      <div className="min-w-0 flex-1">
        <p className={`truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`}>{label}</p>
        <p className={`truncate ${STOREFRONT_TYPOGRAPHY.helper}`}>{entry.url || 'No profile URL added'}</p>
      </div>
    </>
  );

  if (!isValidUrl(normalizedUrl)) return <div className="flex min-w-0 flex-1 items-center gap-2">{content}</div>;
  return (
    <a
      href={normalizedUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label} social link`}
      title={normalizedUrl}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-1"
    >
      {content}
    </a>
  );
}

function SocialLinkRow({ entry, index, entries, disabled, onChange, onDelete, onEdit, isPending, modalMode }) {
  const normalizedUrl = entry.url.trim();
  const duplicate = entries.some((candidate, candidateIndex) => candidateIndex !== index && candidate.platform === entry.platform);
  const urlError = normalizedUrl ? (!isValidUrl(normalizedUrl) ? 'Please enter a valid URL.' : '') : 'URL is required.';
  const platformError = !entry.platform ? 'Select a platform.' : duplicate ? 'This platform has already been added.' : '';
  const usedPlatforms = entries.filter((_, candidateIndex) => candidateIndex !== index).map((candidate) => candidate.platform);

  return (
    <div
      role="listitem"
      aria-label={`${index + 1}. ${entry.platform || 'Select platform'}`}
      className={modalMode ? 'h-full min-w-0 px-3 py-2.5 sm:px-4 sm:py-3' : 'h-full min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3'}
    >
      <div className="flex min-w-0 items-center gap-2">
        {modalMode ? (
          <>
            <SocialLinkPreview entry={entry} normalizedUrl={normalizedUrl} />
            <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(index)} disabled={disabled} aria-label={`Edit social link ${index + 1}`} title="Edit social link" className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 text-[#536B8C] hover:border-blue-200 hover:bg-blue-50 hover:text-[#1A4E8D]"><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
          </>
        ) : <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-blue-100 bg-blue-50" aria-hidden="true"><PlatformIcon platform={entry.platform} /></span>
            <select
              value={entry.platform}
              disabled={disabled}
              aria-label={`Social platform ${index + 1}`}
              aria-invalid={Boolean(platformError)}
              onChange={(event) => onChange(index, 'platform', event.target.value)}
              className={`h-9 min-w-0 flex-1 rounded-lg border bg-white px-2.5 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 disabled:cursor-not-allowed disabled:opacity-50 ${platformError ? 'border-rose-300' : 'border-slate-200'}`}
            >
              <option value="" disabled>Select platform</option>
              {STOREFRONT_SOCIAL_PLATFORMS.map((platform) => (
                <option key={platform.id} value={platform.id} disabled={usedPlatforms.includes(platform.id)}>{platform.label}{usedPlatforms.includes(platform.id) ? ' (already added)' : ''}</option>
              ))}
            </select>
          </div>
          {platformError ? <p className="text-[11px] font-semibold leading-4 text-rose-600" role="alert">{platformError}</p> : null}
          <Input
            value={entry.url}
            onChange={(event) => onChange(index, 'url', event.target.value)}
            disabled={disabled}
            type="url"
            inputMode="url"
            maxLength={255}
            aria-label={`Profile URL ${index + 1}`}
            aria-invalid={Boolean(urlError)}
            placeholder={STOREFRONT_SOCIAL_PLATFORMS.find((platform) => platform.id === entry.platform)?.placeholder || 'https://...'}
            className={`h-9 rounded-lg border-slate-200 px-2.5 text-[13px] text-[#0F172A] focus-visible:border-[#1A4E8D] focus-visible:ring-[#1A4E8D] ${urlError ? 'border-rose-300 focus-visible:border-rose-500 focus-visible:ring-rose-500' : ''}`}
          />
          {urlError ? <p className="text-[11px] font-semibold leading-4 text-rose-600" role="alert">{urlError}</p> : null}
          {isPending ? <p className="sr-only" aria-live="polite">Choose a platform and enter a profile URL.</p> : null}
        </div>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          disabled={disabled}
          aria-label={`Remove social link ${index + 1}`}
          title={`Remove social link ${index + 1}`}
          className="h-8 w-8 shrink-0 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-rose-500"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function SocialLinkDialog({ mode, open, draft, entries, editIndex, onChange, onClose, onSubmit }) {
  const editing = mode === 'edit';
  const currentPlatform = draft?.platform || '';
  const usedPlatforms = entries.filter((_, index) => !editing || index !== editIndex).map((entry) => entry.platform);
  const platformError = !currentPlatform ? 'Select a platform.' : usedPlatforms.includes(currentPlatform) ? 'This platform has already been added.' : '';
  const url = String(draft?.url || '').trim();
  const urlError = !url ? 'URL is required.' : !isValidUrl(url) ? 'Please enter a valid URL.' : '';
  const valid = !platformError && !urlError;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} overlayClassName="bg-black/30 backdrop-blur-none">
      <DialogContent aria-labelledby="storefront-social-link-dialog-title" aria-describedby="storefront-social-link-dialog-description" className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
        <form onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit({ platform: currentPlatform, url }); }}>
          <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
            <DialogTitle id="storefront-social-link-dialog-title" className="text-[16px] font-extrabold text-[#0F172A]">{editing ? 'Edit Social Link' : 'Add Social Link'}</DialogTitle>
            <DialogDescription id="storefront-social-link-dialog-description" className="mt-1 text-[12px] leading-5 text-[#64748B]">{editing ? 'Update the social channel customers see on your storefront.' : 'Connect a social channel customers can use to find your store.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-5 sm:px-6">
            <div className="grid gap-1.5">
              <Label htmlFor="storefront-social-platform" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Platform</Label>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50" aria-hidden="true"><PlatformIcon platform={currentPlatform} /></span>
                <select id="storefront-social-platform" value={currentPlatform} onChange={(event) => onChange({ ...draft, platform: event.target.value })} className={`h-9 min-w-0 flex-1 rounded-lg border bg-white px-2.5 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 ${platformError ? 'border-rose-300' : 'border-slate-200'}`}>
                  <option value="" disabled>Select platform</option>
                  {STOREFRONT_SOCIAL_PLATFORMS.map((platform) => <option key={platform.id} value={platform.id} disabled={usedPlatforms.includes(platform.id)}>{platform.label}{usedPlatforms.includes(platform.id) ? ' (already added)' : ''}</option>)}
                </select>
              </div>
              {platformError ? <p className="text-[11px] font-semibold leading-4 text-rose-600" role="alert">{platformError}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="storefront-social-url" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Profile URL</Label>
              <Input id="storefront-social-url" type="url" inputMode="url" autoFocus={!editing} value={draft?.url || ''} onChange={(event) => onChange({ ...draft, url: event.target.value.slice(0, 255) })} placeholder={STOREFRONT_SOCIAL_PLATFORMS.find((platform) => platform.id === currentPlatform)?.placeholder || 'https://...'} maxLength={255} aria-invalid={Boolean(urlError)} className={`h-9 rounded-lg border-slate-200 text-[13px] text-[#0F172A] ${urlError ? 'border-rose-300 focus-visible:border-rose-500 focus-visible:ring-rose-500' : ''}`} />
              {urlError ? <p className="text-[11px] font-semibold leading-4 text-rose-600" role="alert">{urlError}</p> : null}
            </div>
          </div>
          <DialogFooter className="flex-row items-center gap-2 border-t border-slate-100 px-5 py-4 sm:justify-end sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-9 min-w-0 flex-1 text-[13px] font-bold sm:flex-none sm:text-[14px]">Cancel</Button>
            <Button type="submit" disabled={!valid} className="min-h-9 min-w-0 flex-1 bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73] sm:flex-none sm:text-[14px]">{editing ? 'Save Changes' : 'Add Social Link'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function StorefrontSocialLinksSettings({ links = {}, onChange, disabled = false, interactionMode = 'inline' }) {
  const normalizedEntries = useMemo(() => normalizeSocialLinks(links), [links]);
  const [pendingEntry, setPendingEntry] = useState(null);
  const [linkDialog, setLinkDialog] = useState({ mode: null, index: null, draft: { platform: '', url: '' } });
  const [announcement, setAnnouncement] = useState('');
  const availablePlatform = STOREFRONT_SOCIAL_PLATFORMS.find(({ id }) => !normalizedEntries.some((entry) => entry.platform === id));
  const entries = pendingEntry ? [...normalizedEntries, pendingEntry] : normalizedEntries;
  const atMaximum = entries.length >= MAX_STOREFRONT_SOCIAL_LINKS;

  const emitEntries = (nextEntries) => onChange?.(toSocialLinksObject(nextEntries));

  const handleAdd = () => {
    if (disabled || atMaximum || !availablePlatform) return;
    if (interactionMode === 'modal') {
      setLinkDialog({ mode: 'add', index: null, draft: { platform: availablePlatform.id, url: '' } });
      return;
    }
    setPendingEntry({ platform: availablePlatform.id, url: '' });
    setAnnouncement(`${availablePlatform.label} social link added.`);
  };

  const handleDialogSubmit = (value) => {
    if (linkDialog.mode === 'edit' && linkDialog.index != null) {
      emitEntries(normalizedEntries.map((entry, index) => index === linkDialog.index ? value : entry));
      setAnnouncement(`${value.platform} social link updated.`);
    } else if (linkDialog.mode === 'add' && normalizedEntries.length < MAX_STOREFRONT_SOCIAL_LINKS) {
      emitEntries([...normalizedEntries, value]);
      setAnnouncement(`${value.platform} social link added.`);
    }
    setLinkDialog({ mode: null, index: null, draft: { platform: '', url: '' } });
  };

  const handleChange = (index, field, value) => {
    if (pendingEntry && index === normalizedEntries.length) {
      const nextPending = { ...pendingEntry, [field]: value };
      setPendingEntry(nextPending);
      if (nextPending.url.trim()) {
        setPendingEntry(null);
        emitEntries([...normalizedEntries, nextPending]);
      }
      return;
    }
    const nextEntries = normalizedEntries.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, [field]: value } : entry
    ));
    emitEntries(nextEntries);
  };

  const handleDelete = (index) => {
    if (pendingEntry && index === normalizedEntries.length) {
      setPendingEntry(null);
      setAnnouncement('New social link removed.');
      return;
    }
    const removed = normalizedEntries[index];
    emitEntries(normalizedEntries.filter((_, entryIndex) => entryIndex !== index));
    setAnnouncement(`${removed?.platform || 'Social link'} removed.`);
  };

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-labelledby="storefront-social-links-heading">
      <StorefrontSectionHeader
        title="Social Links"
        titleId="storefront-social-links-heading"
        description="Connect your social channels to your storefront."
        info={atMaximum ? <><p className="font-extrabold text-[#0F172A]">You have reached the maximum of {MAX_STOREFRONT_SOCIAL_LINKS} social links.</p><p className="mt-1">Remove a link to add a new one.</p></> : <><p className="font-extrabold text-[#0F172A]">You can add up to {MAX_STOREFRONT_SOCIAL_LINKS} social links.</p><p className="mt-1">These will be shown on your storefront so customers can find and follow you.</p></>}
        infoLabel="Social Links"
        infoPanelId="storefront-social-links-guidance"
        hasData={entries.length > 0}
        action={(
          <Button
            type="button"
            onClick={handleAdd}
            disabled={disabled || atMaximum}
            aria-label={atMaximum ? `Add social link (maximum of ${MAX_STOREFRONT_SOCIAL_LINKS} reached)` : 'Add social link'}
            title={atMaximum ? `Maximum of ${MAX_STOREFRONT_SOCIAL_LINKS} social links reached` : 'Add social link'}
            className="min-h-9 w-full gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:text-[13px]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />Add Social Link
          </Button>
        )}
        actionNote={atMaximum ? <span className="text-right text-[11px] font-semibold text-[#64748B]">Maximum of {MAX_STOREFRONT_SOCIAL_LINKS} social links reached.</span> : null}
      />

      {entries.length > 0 ? (
        <div
          className={`mt-4 grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] ${interactionMode === 'modal' ? 'gap-0 divide-y divide-slate-200 sm:divide-y-0 sm:divide-x' : 'gap-3'}`}
          role="list"
          aria-label="Storefront social links"
        >
          {entries.map((entry, index) => (
            <SocialLinkRow
              key={`${entry.platform || 'new'}-${index}`}
              entry={entry}
              index={index}
              entries={entries}
              disabled={disabled}
              isPending={pendingEntry != null && index === normalizedEntries.length}
              modalMode={interactionMode === 'modal'}
              onChange={handleChange}
              onDelete={handleDelete}
              onEdit={(entryIndex) => {
                if (interactionMode === 'modal' && !disabled) setLinkDialog({ mode: 'edit', index: entryIndex, draft: { ...normalizedEntries[entryIndex] } });
              }}
            />
          ))}
        </div>
      ) : (
        <StorefrontEmptyState
          className="mt-4"
          icon={Link2}
          title="No social links added yet."
          description="Add links so customers can find you on social media."
          action={<Button type="button" onClick={handleAdd} disabled={disabled} aria-label="Add social link" className="mt-3 min-h-9 gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]"><Plus className="h-4 w-4" aria-hidden="true" />Add Social Link</Button>}
        />
      )}

      <p className="sr-only" aria-live="polite">{announcement}</p>
      {interactionMode === 'modal' ? <SocialLinkDialog mode={linkDialog.mode} open={linkDialog.mode != null} draft={linkDialog.draft} entries={normalizedEntries} editIndex={linkDialog.index} onChange={(draft) => setLinkDialog((current) => ({ ...current, draft }))} onClose={() => setLinkDialog({ mode: null, index: null, draft: { platform: '', url: '' } })} onSubmit={handleDialogSubmit} /> : null}
    </section>
  );
}

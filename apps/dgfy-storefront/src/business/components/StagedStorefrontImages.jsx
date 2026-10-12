import React, { useRef, useState } from 'react';
import { Camera, Check, Image as ImageIcon, Loader2, Trash2, Upload, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

const IMAGE_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png';
const IMAGE_CATEGORIES = [
  { key: 'profile_image', label: 'Profile photo' },
  { key: 'cover_image', label: 'Cover photo' }
];

const emptyFieldState = () => ({ isUploading: false, isRemoving: false, progress: null, error: '' });

const activeUploadFor = (uploads, category) => (Array.isArray(uploads) ? uploads : [])
  .find((upload) => upload?.category === category && upload?.upload_status !== 'removed' && !upload?.removed_at);

const uploadIdOf = (upload) => String(upload?.id || upload?.upload_id || '').trim();

const errorMessage = (error, fallback) => (
  error?.response?.data?.message || error?.message || fallback
);

export default function StagedStorefrontImages({ uploads, previewUrls, disabled = false, onUpload, onRemove }) {
  const profileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const [fieldStates, setFieldStates] = useState({
    profile_image: emptyFieldState(),
    cover_image: emptyFieldState()
  });

  const updateFieldState = (category, patch) => setFieldStates((current) => ({
    ...current,
    [category]: { ...current[category], ...patch }
  }));

  const handleUpload = async (category, event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    const fieldState = fieldStates[category];
    if (!file || disabled || fieldState.isUploading || fieldState.isRemoving) return;

    updateFieldState(category, { isUploading: true, progress: 0, error: '' });
    try {
      await onUpload(category, file, (progress) => updateFieldState(category, { progress }));
    } catch (uploadError) {
      updateFieldState(category, { error: errorMessage(uploadError, 'The image could not be uploaded.') });
    } finally {
      updateFieldState(category, { isUploading: false, progress: null });
    }
  };

  const handleRemove = async (category) => {
    const upload = activeUploadFor(uploads, category);
    const fieldState = fieldStates[category];
    if (!upload || disabled || fieldState.isUploading || fieldState.isRemoving) return;

    updateFieldState(category, { isRemoving: true, error: '' });
    try {
      await onRemove(uploadIdOf(upload));
    } catch (removeError) {
      updateFieldState(category, { error: errorMessage(removeError, 'The image could not be removed.') });
    } finally {
      updateFieldState(category, { isRemoving: false });
    }
  };

  const openPicker = (category) => {
    if (disabled || fieldStates[category].isUploading || fieldStates[category].isRemoving) return;
    (category === 'profile_image' ? profileInputRef : coverInputRef).current?.click();
  };

  const profileUpload = activeUploadFor(uploads, 'profile_image');
  const coverUpload = activeUploadFor(uploads, 'cover_image');
  const profileState = fieldStates.profile_image;
  const coverState = fieldStates.cover_image;

  return (
    <div className="space-y-3">
      <h2 className="sr-only">Storefront images</h2>
      <input
        ref={profileInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        disabled={disabled || profileState.isUploading || profileState.isRemoving}
        aria-label="Choose profile photo file"
        onChange={(event) => { void handleUpload('profile_image', event); }}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        disabled={disabled || coverState.isUploading || coverState.isRemoving}
        aria-label="Choose cover photo file"
        onChange={(event) => { void handleUpload('cover_image', event); }}
      />

      <div className="relative min-w-0 pb-1">
        <div className="relative h-40 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-48">
          {previewUrls?.cover_image ? (
            <img src={previewUrls.cover_image} alt="Cover photo preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <ImageIcon className="h-8 w-8" aria-hidden="true" />
              <span className="text-xs font-semibold">{coverUpload ? 'Cover photo staged' : 'No cover photo uploaded'}</span>
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-md border border-white/80 bg-white/95 px-2.5 py-1 text-xs font-extrabold text-slate-900 shadow-sm">Cover photo</span>
          <Button
            type="button"
            variant="outline"
            aria-label={coverUpload ? 'Replace cover photo' : 'Choose cover photo'}
            onClick={() => openPicker('cover_image')}
            disabled={disabled || coverState.isUploading || coverState.isRemoving}
            className="absolute bottom-2 right-2 min-h-9 gap-1.5 rounded-lg border-blue-200 bg-white/95 px-3 text-xs font-bold text-[#1A4E8D] shadow-sm"
          >
            {coverState.isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {coverState.isUploading ? 'Uploading…' : coverUpload ? 'Replace cover photo' : 'Choose cover photo'}
          </Button>
        </div>

        <div className="absolute -bottom-8 left-4 h-16 w-16 rounded-full border-4 border-white bg-slate-100 shadow-md sm:h-20 sm:w-20">
          <div className="h-full w-full overflow-hidden rounded-full">
            {previewUrls?.profile_image ? (
              <img src={previewUrls.profile_image} alt="Profile photo preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <UserRound className="h-7 w-7" aria-hidden="true" />
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label={profileUpload ? 'Replace profile photo' : 'Choose profile photo'}
            title={profileUpload ? 'Replace profile photo' : 'Choose profile photo'}
            onClick={() => openPicker('profile_image')}
            disabled={disabled || profileState.isUploading || profileState.isRemoving}
            className="absolute bottom-0 right-0 grid h-9 w-9 translate-x-1/4 translate-y-1/4 place-items-center rounded-full border-2 border-white bg-white text-[#1A4E8D] shadow-md transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {profileState.isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="grid gap-3 pt-9 sm:grid-cols-2">
        {IMAGE_CATEGORIES.map(({ key, label }) => {
          const upload = key === 'profile_image' ? profileUpload : coverUpload;
          const state = fieldStates[key];
          const progress = state.progress == null ? 30 : Math.max(5, state.progress);
          return (
            <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="flex min-h-8 min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h3 className="shrink-0 text-sm font-bold text-slate-900">{label}</h3>
                  {upload ? (
                    <p className="flex min-w-0 items-center gap-1 text-xs font-semibold text-emerald-700" role="status">
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate" title={upload.original_name || 'Image staged for review'}>{upload.original_name || 'Image staged for review'}</span>
                    </p>
                  ) : <span className="shrink-0 text-xs font-medium text-slate-500">Not added</span>}
                </div>
                {upload ? (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={'Remove ' + label.toLowerCase()}
                    onClick={() => { void handleRemove(key); }}
                    disabled={disabled || state.isUploading || state.isRemoving}
                    className="min-h-8 shrink-0 gap-1 rounded-lg border-rose-200 px-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                  >
                    {state.isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    {state.isRemoving ? 'Removing…' : 'Remove'}
                  </Button>
                ) : null}
              </div>
              {state.isUploading ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={label + ' upload progress'} aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
                  <div className="h-full rounded-full bg-[#1A4E8D] transition-[width]" style={{ width: progress + '%' }} />
                </div>
              ) : null}
              {state.error ? <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">{state.error}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

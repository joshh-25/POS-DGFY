import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Check, GripVertical, Image as ImageIcon, MoreHorizontal, Pencil,
  Plus, RefreshCcw, Trash2, Upload, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveImage } from '@/src/components/media/ResponsiveImage.jsx';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import { STOREFRONT_TYPOGRAPHY, StorefrontEmptyState, StorefrontSectionHeader } from './StorefrontSectionPrimitives.jsx';
import { POS_MODAL_HEADER_SURFACE_CLASS } from '../components/posModalStyles.js';

export const MAX_STOREFRONT_GALLERY_IMAGES = 8;
export const MAX_STOREFRONT_GALLERY_FILE_BYTES = 5 * 1024 * 1024;
export const STOREFRONT_GALLERY_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const normalizeGalleryImages = (value) => (Array.isArray(value)
  ? value
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const url = String(entry.url || '').trim();
      const path = String(entry.path || '').trim();
      const uploadId = String(entry.upload_id || entry.id || '').trim();
      if (!url && !path && !uploadId) return null;
      return {
        ...(uploadId ? { upload_id: uploadId } : {}),
        url,
        path,
        caption: String(entry.caption || '').trim().slice(0, 140),
        alt: String(entry.alt || '').trim().slice(0, 140),
        sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sort_order - right.sort_order)
    .slice(0, MAX_STOREFRONT_GALLERY_IMAGES)
    .map((entry, index) => ({ ...entry, sort_order: index }))
  : []);

const getImageSource = (entry) => {
  const rawUrl = String(entry?.url || '').trim();
  const rawPath = String(entry?.path || '').trim();
  if (rawUrl) return resolveAssetUrl(rawUrl);
  if (!rawPath) return '';
  return resolveAssetUrl(rawPath.startsWith('storefront-assets/') ? `/uploads/${rawPath}` : rawPath);
};

const formatBytes = (value) => {
  const bytes = Number(value || 0);
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileExtension = (file) => String(file?.name || '').split('.').pop()?.toLowerCase() || '';

const validateFile = (file) => {
  const extension = getFileExtension(file);
  if (!SUPPORTED_MIME_TYPES.has(String(file?.type || '').toLowerCase()) && !SUPPORTED_EXTENSIONS.has(extension)) {
    return 'Unsupported file type. Use JPG, PNG, or WebP.';
  }
  if (Number(file?.size || 0) > MAX_STOREFRONT_GALLERY_FILE_BYTES) {
    return 'File exceeds 5 MB.';
  }
  return '';
};

const reindexImages = (images) => (Array.isArray(images) ? images : [])
  .map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const url = String(entry.url || '').trim();
    const path = String(entry.path || '').trim();
    const uploadId = String(entry.upload_id || entry.id || '').trim();
    if (!url && !path && !uploadId) return null;
    return {
      ...(uploadId ? { upload_id: uploadId } : {}),
      url,
      path,
      caption: String(entry.caption || '').trim().slice(0, 140),
      alt: String(entry.alt || '').trim().slice(0, 140)
    };
  })
  .filter(Boolean)
  .slice(0, MAX_STOREFRONT_GALLERY_IMAGES)
  .map((entry, index) => ({ ...entry, sort_order: index }));

function GalleryTile({
  entry, index, menuOpen, disabled, isDragging, isDropTarget, onToggleMenu, onEdit, onReplace,
  onRemove, onDragStart, onDragOver, onDrop, onDragEnd, onMoveWithKeyboard, editing, editDraft, setEditDraft, hasActiveUpload, onCancelEdit, onSaveEdit
}) {
  const title = entry.caption || entry.alt || `Gallery image ${index + 1}`;
  return (
    <div className="min-w-0">
    <div
      role="listitem"
      tabIndex={disabled ? -1 : 0}
      draggable={!disabled}
      onDragStart={(event) => onDragStart(event, index)}
      onDragOver={(event) => onDragOver(event, index)}
      onDrop={(event) => onDrop(event, index)}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (!disabled && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
          onMoveWithKeyboard(index, event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      aria-label={`${index + 1}. ${title}`}
      className={`group relative aspect-[4/3] min-w-0 overflow-visible rounded-lg border bg-slate-100 shadow-sm transition focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] ${isDragging ? 'opacity-60' : ''} ${isDropTarget ? 'border-[#1A4E8D] ring-2 ring-[#9FC4FF]' : 'border-slate-200'}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        {getImageSource(entry) ? (
          <ResponsiveImage
            sources={{ src: getImageSource(entry) }}
            alt={entry.alt || entry.caption || `Storefront gallery image ${index + 1}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400" aria-label="Image preview unavailable"><ImageIcon className="h-7 w-7" aria-hidden="true" /></div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/30 to-transparent" aria-hidden="true" />
      </div>
      <span className="absolute left-2 top-2 grid h-7 w-6 place-items-center rounded-md bg-black/35 text-white" title="Drag to reorder" aria-hidden="true"><GripVertical className="h-4 w-4" /></span>
      <span className="absolute bottom-2 left-2 grid h-6 min-w-6 place-items-center rounded-md bg-white/95 px-1.5 text-[11px] font-extrabold tabular-nums text-[#0F172A] shadow-sm" aria-label={`Order ${index + 1}`}>{index + 1}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(event) => { event.stopPropagation(); onToggleMenu(index); }}
        disabled={disabled}
        aria-label={`Gallery image ${index + 1} actions`}
        title="Image actions"
        aria-expanded={menuOpen}
        className="absolute right-2 top-2 z-10 h-8 w-8 rounded-md border border-white/70 bg-white/95 text-[#1A4E8D] shadow-sm hover:bg-white focus-visible:ring-[#1A4E8D]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {menuOpen ? (
        <div role="menu" aria-label={`Actions for gallery image ${index + 1}`} className="absolute right-2 top-11 z-30 w-40 rounded-lg border border-slate-200 bg-white p-1.5 text-left shadow-lg" onClick={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => onEdit(index)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-[12px] font-semibold text-[#0F172A] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"><Pencil className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" />Edit details</button>
          <button type="button" role="menuitem" onClick={() => onReplace(index)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-[12px] font-semibold text-[#0F172A] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"><RefreshCcw className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" />Replace image</button>
          <button type="button" role="menuitem" onClick={() => onRemove(index)} className="flex min-h-9 w-full items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remove</button>
        </div>
      ) : null}
    </div>
    {editing ? <GalleryEditForm entry={entry} index={index} editDraft={editDraft} setEditDraft={setEditDraft} hasActiveUpload={hasActiveUpload} onReplace={onReplace} onCancel={onCancelEdit} onSave={onSaveEdit} /> : null}
    </div>
  );
}

function GalleryModal({ title, children, onClose, labelledBy }) {
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

function GalleryEditForm({ entry, index, editDraft, setEditDraft, hasActiveUpload, onReplace, onCancel, onSave }) {
  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/30 p-3" aria-label={`Edit gallery image ${index + 1}`}>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        {getImageSource(entry) ? <ResponsiveImage sources={{ src: getImageSource(entry) }} alt={entry?.alt || `Gallery image ${index + 1}`} className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center text-slate-400"><ImageIcon className="h-8 w-8" aria-hidden="true" /></div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className={STOREFRONT_TYPOGRAPHY.itemLabel}>Edit image details</p>
        <Button type="button" variant="outline" onClick={() => onReplace(index)} disabled={hasActiveUpload} className="min-h-9 rounded-lg border-blue-200 px-3 text-[12px] font-bold text-[#1A4E8D] hover:bg-blue-50"><Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Change Image</Button>
      </div>
      <div className="mt-3 space-y-3">
        <div className="space-y-1.5"><div className="flex items-center justify-between"><Label htmlFor={`storefront-gallery-caption-${index}`} className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Caption <span className="font-normal text-[#64748B]">(Optional)</span></Label><span className="text-[11px] text-[#64748B]">{editDraft.caption.length}/100</span></div><Input id={`storefront-gallery-caption-${index}`} value={editDraft.caption} onChange={(event) => setEditDraft((current) => ({ ...current, caption: event.target.value.slice(0, 100) }))} maxLength={100} className="h-9 rounded-lg border-slate-200 text-[13px]" /></div>
        <div className="space-y-1.5"><div className="flex items-center justify-between"><Label htmlFor={`storefront-gallery-alt-${index}`} className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Alt Text</Label><span className="text-[11px] text-[#64748B]">{editDraft.alt.length}/125</span></div><Input id={`storefront-gallery-alt-${index}`} value={editDraft.alt} onChange={(event) => setEditDraft((current) => ({ ...current, alt: event.target.value.slice(0, 125) }))} maxLength={125} className="h-9 rounded-lg border-slate-200 text-[13px]" /></div>
      </div>
      <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3"><Button type="button" variant="outline" onClick={onCancel} className="min-h-9 rounded-lg px-3 text-[12px] font-bold">Cancel</Button><Button type="button" onClick={onSave} className="min-h-9 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-bold text-white hover:bg-[#143F73]">Save Changes</Button></div>
    </div>
  );
}

function UploadProgressList({ uploads, onRetry }) {
  if (!uploads.length) return null;
  return (
    <div className="mt-3 space-y-2" aria-live="polite" aria-label="Gallery upload status">
      {uploads.map((upload) => (
        <div key={upload.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white text-[#1A4E8D]"><ImageIcon className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className={`truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`}>{upload.name}</p>
              <p className="text-[11px] text-[#64748B]">{formatBytes(upload.size)}{upload.status === 'error' ? ' · Upload failed' : upload.status === 'success' ? ' · Uploaded' : ''}</p>
            </div>
            {upload.status === 'error' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onRetry(upload)} className="min-h-8 shrink-0 rounded-md border-blue-200 px-2 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50"><RefreshCcw className="mr-1 h-3 w-3" aria-hidden="true" />Retry</Button>
            ) : upload.status === 'success' ? <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Upload complete" /> : <span className="shrink-0 text-[10px] font-bold text-[#1A4E8D]">{upload.progress == null ? 'Uploading…' : `${upload.progress}%`}</span>}
          </div>
          {upload.status !== 'error' ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-[width] ${upload.status === 'success' ? 'bg-emerald-500' : 'bg-[#1A4E8D]'}`} style={{ width: `${upload.progress == null ? 30 : Math.max(4, upload.progress)}%` }} /></div> : <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-rose-600"><AlertCircle className="h-3 w-3" aria-hidden="true" />{upload.error || 'Failed to upload. Please try again.'}</p>}
        </div>
      ))}
    </div>
  );
}

export default function StorefrontGallerySettings({
  images = [], onChange, onUploadImage, onRemoveImage, disabled = false, loading = false, assetUploadingType = ''
}) {
  const normalizedImages = useMemo(() => normalizeGalleryImages(images), [images]);
  const workingImagesRef = useRef(normalizedImages);
  const uploadInputRef = useRef(null);
  const draggedIndexRef = useRef(null);
  const [menuIndex, setMenuIndex] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const [editIndex, setEditIndex] = useState(null);
  const [editDraft, setEditDraft] = useState({ caption: '', alt: '' });
  const [removeIndex, setRemoveIndex] = useState(null);
  const [fileTarget, setFileTarget] = useState(null);

  const hasActiveUpload = uploads.some((upload) => upload.status === 'uploading') || Boolean(assetUploadingType);
  useEffect(() => {
    if (!hasActiveUpload) workingImagesRef.current = normalizedImages;
  }, [normalizedImages, hasActiveUpload]);

  const emitImages = (nextImages) => {
    const next = reindexImages(nextImages);
    workingImagesRef.current = next;
    onChange?.(next);
  };

  const updateUpload = (id, patch) => setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)));
  const clearUploadSoon = (id) => window.setTimeout(() => setUploads((current) => current.filter((upload) => upload.id !== id)), 700);

  const runUpload = async (file, { replaceIndex = null, retryId = null } = {}) => {
    const id = retryId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (!retryId) setUploads((current) => [...current, { id, name: file.name || 'image', size: file.size || 0, file, status: 'uploading', progress: 0, replaceIndex }]);
    else updateUpload(id, { status: 'uploading', progress: 0, error: '' });
    const result = await onUploadImage?.(replaceIndex, file, { onProgress: (progress) => updateUpload(id, { progress }) });
    if (!result?.success) {
      updateUpload(id, { status: 'error', progress: 0, error: result?.error || 'Failed to upload. Please try again.' });
      return false;
    }
    const uploaded = result.uploaded || {};
    const uploadedId = String(uploaded.upload_id || uploaded.id || '').trim();
    const uploadedEntry = {
      ...(uploadedId ? { upload_id: uploadedId } : {}),
      url: String(uploaded.image_url || uploaded.url || '').trim(),
      path: String(uploaded.path || '').trim(),
      caption: '',
      alt: '',
      sort_order: 0
    };
    if (replaceIndex == null) {
      emitImages([...workingImagesRef.current, uploadedEntry]);
      setAnnouncement(`${file.name || 'Image'} uploaded.`);
    } else {
      emitImages(workingImagesRef.current.map((entry, index) => (index === replaceIndex ? {
        ...entry,
        ...(uploadedEntry.upload_id ? { upload_id: uploadedEntry.upload_id } : {}),
        url: uploadedEntry.url,
        path: uploadedEntry.path
      } : entry)));
      setAnnouncement(`${file.name || 'Image'} replaced.`);
    }
    updateUpload(id, { status: 'success', progress: 100 });
    clearUploadSoon(id);
    return true;
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || disabled) return;
    const available = Math.max(0, MAX_STOREFRONT_GALLERY_IMAGES - workingImagesRef.current.length - uploads.filter((upload) => upload.status === 'uploading' && upload.replaceIndex == null).length);
    let accepted = 0;
    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError || accepted >= available) {
        const error = validationError || `Maximum of ${MAX_STOREFRONT_GALLERY_IMAGES} images reached.`;
        setUploads((current) => [...current, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name || 'image', size: file.size || 0, file, status: 'error', progress: 0, error, replaceIndex: null }]);
        continue;
      }
      accepted += 1;
      await runUpload(file);
    }
    if (accepted > 0) setAnnouncement(`${accepted} gallery ${accepted === 1 ? 'image' : 'images'} processed.`);
  };

  const handleInputChange = (event) => {
    const files = Array.from(event.target.files || []);
    const target = fileTarget;
    event.target.value = '';
    setFileTarget(null);
    if (target?.type === 'replace') {
      const file = files[0];
      if (!file) return;
      const validationError = validateFile(file);
      if (validationError) {
        setUploads((current) => [...current, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name || 'image', size: file.size || 0, file, status: 'error', progress: 0, error: validationError, replaceIndex: target.index }]);
        return;
      }
      void runUpload(file, { replaceIndex: target.index });
      return;
    }
    void handleFiles(files);
  };

  const openPicker = (target = { type: 'add' }) => {
    if (disabled || hasActiveUpload) return;
    setFileTarget(target);
    window.setTimeout(() => uploadInputRef.current?.click(), 0);
  };

  const moveImage = (fromIndex, toIndex) => {
    const current = workingImagesRef.current;
    if (fromIndex == null || toIndex == null || fromIndex === toIndex || toIndex < 0 || toIndex >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    emitImages(next);
    setAnnouncement(`${moved.caption || moved.alt || `Image ${fromIndex + 1}`} moved to position ${toIndex + 1}.`);
  };

  const handleDrop = (event, targetIndex) => {
    event.preventDefault();
    moveImage(draggedIndexRef.current, targetIndex);
    draggedIndexRef.current = null;
    setDraggedIndex(null);
    setDropIndex(null);
  };

  const openEdit = (index) => {
    const entry = workingImagesRef.current[index];
    setMenuIndex(null);
    setEditIndex(index);
    setEditDraft({ caption: entry?.caption || '', alt: entry?.alt || '' });
  };

  const saveEdit = () => {
    if (editIndex == null) return;
    emitImages(workingImagesRef.current.map((entry, index) => (index === editIndex ? { ...entry, caption: editDraft.caption.slice(0, 100), alt: editDraft.alt.slice(0, 125) } : entry)));
    setAnnouncement(`Gallery image ${editIndex + 1} details saved.`);
    setEditIndex(null);
  };

  const removeImage = () => {
    if (removeIndex == null) return;
    const removed = workingImagesRef.current[removeIndex];
    emitImages(workingImagesRef.current.filter((_, index) => index !== removeIndex));
    Promise.resolve(onRemoveImage?.(removed, removeIndex)).catch(() => {});
    setAnnouncement(`${removed?.caption || removed?.alt || `Image ${removeIndex + 1}`} removed.`);
    setRemoveIndex(null);
  };

  const retryUpload = (upload) => {
    if (!upload?.file) return;
    const validationError = validateFile(upload.file);
    if (validationError) {
      updateUpload(upload.id, { error: validationError });
      return;
    }
    void runUpload(upload.file, { replaceIndex: upload.replaceIndex, retryId: upload.id });
  };

  const atMaximum = normalizedImages.length >= MAX_STOREFRONT_GALLERY_IMAGES;
  const visibleUploads = uploads.filter((upload) => upload.status !== 'success');

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-labelledby="storefront-gallery-heading">
      <input ref={uploadInputRef} type="file" accept={STOREFRONT_GALLERY_ACCEPT} multiple={fileTarget?.type !== 'replace'} onChange={handleInputChange} className="sr-only" aria-label="Choose gallery images" />
      <StorefrontSectionHeader
        title="Gallery"
        titleId="storefront-gallery-heading"
        description="Show photos of your store, products, food, or ambiance."
        info={atMaximum ? <><p className="font-extrabold text-[#0F172A]">You have reached the maximum of 8 images.</p><p className="mt-1">Remove an image to upload another.</p></> : <><p className="font-extrabold text-[#0F172A]">You can upload up to 8 images.</p><p className="mt-1">Supported formats: JPG, PNG, WebP. Maximum file size: 5 MB per image. Recommended ratio: 4:3.</p></>}
        infoLabel="Gallery"
        infoPanelId="storefront-gallery-guidance"
        hasData={normalizedImages.length > 0}
        action={<Button type="button" onClick={() => openPicker()} disabled={disabled || atMaximum || hasActiveUpload} aria-label={atMaximum ? 'Upload images (maximum of 8 reached)' : 'Upload images'} title={atMaximum ? 'Maximum of 8 images reached' : 'Upload images'} className="min-h-9 w-full gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:text-[13px]"><Plus className="h-4 w-4" aria-hidden="true" />Upload Images</Button>}
        actionNote={atMaximum ? <span className="text-right text-[11px] font-semibold text-[#64748B]">Maximum of 8 images reached.</span> : null}
      />

      {loading ? (
        <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4" aria-label="Loading gallery images">
          {Array.from({ length: 8 }, (_, index) => <div key={`gallery-skeleton-${index}`} className="aspect-[4/3] animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : normalizedImages.length > 0 ? (
        <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4" role="list" aria-label="Storefront gallery images">
          {normalizedImages.map((entry, index) => (
            <GalleryTile
              key={`${entry.path || entry.url}-${index}`}
              entry={entry}
              index={index}
              menuOpen={menuIndex === index}
              disabled={disabled || hasActiveUpload}
              isDragging={draggedIndex === index}
              isDropTarget={dropIndex === index && draggedIndex !== index}
              onToggleMenu={(nextIndex) => setMenuIndex(menuIndex === nextIndex ? null : nextIndex)}
              onEdit={openEdit}
              editing={editIndex === index}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              hasActiveUpload={hasActiveUpload}
              onCancelEdit={() => setEditIndex(null)}
              onSaveEdit={saveEdit}
              onReplace={(nextIndex) => { setMenuIndex(null); openPicker({ type: 'replace', index: nextIndex }); }}
              onRemove={(nextIndex) => { setMenuIndex(null); setRemoveIndex(nextIndex); }}
              onDragStart={(event, nextIndex) => { draggedIndexRef.current = nextIndex; setDraggedIndex(nextIndex); setDropIndex(nextIndex); event.dataTransfer?.setData('text/plain', String(nextIndex)); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(event, nextIndex) => { if (disabled || hasActiveUpload || draggedIndexRef.current == null) return; event.preventDefault(); setDropIndex(nextIndex); }}
              onDrop={handleDrop}
              onDragEnd={() => { draggedIndexRef.current = null; setDraggedIndex(null); setDropIndex(null); }}
              onMoveWithKeyboard={moveImage}
            />
          ))}
        </div>
      ) : (
        <StorefrontEmptyState
          className="mt-4"
          icon={ImageIcon}
          title="No gallery images yet."
          description="Add photos to make your storefront more engaging."
          action={<Button type="button" onClick={() => openPicker()} disabled={disabled || hasActiveUpload} aria-label="Upload images" className="mt-3 min-h-9 gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]"><Plus className="h-4 w-4" aria-hidden="true" />Upload Images</Button>}
        />
      )}

      <UploadProgressList uploads={visibleUploads} onRetry={retryUpload} />

      <p className="sr-only" aria-live="polite">{announcement}</p>

      {removeIndex != null ? (
        <GalleryModal title="Remove Image" labelledBy="storefront-gallery-remove-heading" onClose={() => setRemoveIndex(null)}>
          <div className="px-4 py-5 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600"><Trash2 className="h-5 w-5" aria-hidden="true" /></span><p className="mt-3 text-[13px] font-extrabold text-[#0F172A]">Are you sure you want to remove this image?</p><p className="mt-1 text-[11px] text-[#64748B]">This action cannot be undone.</p></div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3"><Button type="button" variant="outline" onClick={() => setRemoveIndex(null)} className="min-h-9 rounded-lg px-3 text-[12px] font-bold">Cancel</Button><Button type="button" variant="destructive" onClick={removeImage} className="min-h-9 rounded-lg px-3 text-[12px] font-bold">Remove</Button></div>
        </GalleryModal>
      ) : null}
    </section>
  );
}

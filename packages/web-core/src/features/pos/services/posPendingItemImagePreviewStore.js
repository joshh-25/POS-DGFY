import { getBrowserSessionSnapshot } from '../../../services/browserSession.js';
import { acquirePosImagePreview } from './posImagePreview.js';

let snapshot = {};
const EMPTY = Object.freeze({});
let sequence = 0;
let scope = '';
const resources = new Map();
const listeners = new Set();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const replaceSnapshot = (next) => {
  snapshot = next;
  emit();
};

export const getPendingPosItemImagePreviews = () => scope === sessionScope() ? snapshot : EMPTY;

export const subscribeToPendingPosItemImagePreviews = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const sessionScope = () => {
  const session = getBrowserSessionSnapshot();
  let identity = session.generation;
  try {
    const claims = JSON.parse(atob(session.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    identity = claims.user_id || claims.id || claims.sub || identity;
  } catch { /* Opaque local/test tokens use the session generation. */ }
  return `${session.companyToken}:${identity}`;
};
const dispose = (attemptId) => {
  const resource = resources.get(attemptId);
  if (!resource) return;
  clearTimeout(resource.expiry);
  resource.release?.();
  resources.delete(attemptId);
};
export const resetPendingPosItemImagePreviews = () => {
  resources.forEach((_, attemptId) => dispose(attemptId));
  scope = sessionScope();
  replaceSnapshot({});
};
const syncScope = () => {
  if (scope !== sessionScope()) resetPendingPosItemImagePreviews();
};
if (typeof window !== 'undefined') {
  window.addEventListener('auth:session-updated', syncScope);
  window.addEventListener('auth:logout', resetPendingPosItemImagePreviews);
  window.addEventListener('auth:session-expired', resetPendingPosItemImagePreviews);
}
const matches = ({ itemId, attemptId, jobId }) => {
  const entry = snapshot[String(itemId)];
  return scope === sessionScope() && entry && attemptId && entry.attemptId === attemptId
    && (!jobId || entry.jobId === jobId) ? entry : null;
};

export const stagePendingPosItemImagePreview = ({
  itemId,
  file,
  url = '',
  jobId = null,
  fileKeys = [],
  galleryIntent = null
}) => {
  syncScope();
  const key = String(itemId || '');
  if (!key || (!file && !url)) return null;
  const attemptId = `${++sequence}`;
  const previous = snapshot[key];
  const lease = file ? acquirePosImagePreview(file) : null;
  const normalizedFileKeys = Array.from(new Set((Array.isArray(fileKeys) ? fileKeys : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
  replaceSnapshot({
    ...snapshot,
    [key]: {
      url,
      file,
      fileKeys: normalizedFileKeys,
      galleryIntent,
      jobId,
      attemptId,
      status: 'uploading',
      readyUrl: '',
      resultUrl: ''
    }
  });
  resources.set(attemptId, { release: lease?.release, expiry: setTimeout(() => {
    clearPendingPosItemImagePreview({ itemId, attemptId });
  }, 15 * 60 * 1000) });
  if (previous) dispose(previous.attemptId);
  lease?.promise.then((previewUrl) => {
    const entry = matches({ itemId, attemptId });
    if (entry) replaceSnapshot({ ...snapshot, [key]: { ...entry, url: previewUrl } });
  }).catch(() => { /* Upload continues; retain the persisted image if preview decoding fails. */ });
  return attemptId;
};

export const bindPendingPosItemImagePreviewJob = ({ itemId, attemptId, jobId, fileKeys, galleryIntent }) => {
  const key = String(itemId || '');
  const entry = matches({ itemId, attemptId });
  if (!entry || !jobId) return;
  replaceSnapshot({
    ...snapshot,
    [key]: {
      ...entry,
      ...(Array.isArray(fileKeys) ? { fileKeys } : {}),
      ...(galleryIntent ? { galleryIntent } : {}),
      jobId,
      status: 'processing'
    }
  });
};

export const markPendingPosItemImagePreviewFailed = ({ itemId, attemptId, jobId }) => {
  const key = String(itemId || '');
  const entry = matches({ itemId, attemptId, jobId });
  if (!entry) return;
  replaceSnapshot({
    ...snapshot,
    [key]: { ...entry, status: 'failed' }
  });
};

export const markPendingPosItemImagePreviewUncertain = ({ itemId, attemptId }) => {
  const key = String(itemId || '');
  const entry = matches({ itemId, attemptId });
  if (!entry) return;
  replaceSnapshot({
    ...snapshot,
    [key]: { ...entry, status: 'uncertain' }
  });
};

export const completePendingPosItemImagePreview = ({ itemId, attemptId, jobId, url, resultUrl }) => {
  const entry = matches({ itemId, attemptId, jobId });
  if (!entry || !url || !resultUrl) return;
  if (entry.readyUrl === url) return;
  replaceSnapshot({ ...snapshot, [String(itemId)]: { ...entry, readyUrl: url, resultUrl, status: 'ready' } });
};

export const clearPendingPosItemImagePreview = ({ itemId, attemptId, jobId }) => {
  const key = String(itemId || '');
  const entry = matches({ itemId, attemptId, jobId });
  if (!entry) return;
  const next = { ...snapshot };
  delete next[key];
  replaceSnapshot(next);
  dispose(entry.attemptId);
};

const FIELD_SEPARATOR = '\u001f';

export const getImageFileSelectionKey = (file) => [
  String(file?.name || '').trim(),
  Number(file?.size || 0),
  Number(file?.lastModified || 0),
  String(file?.type || '').trim().toLowerCase()
].join(FIELD_SEPARATOR);

export const dedupeImageFiles = (files = [], existingFiles = []) => {
  const seen = new Set((Array.isArray(existingFiles) ? existingFiles : [])
    .filter(Boolean)
    .map(getImageFileSelectionKey));
  const result = [];
  (Array.isArray(files) ? files : []).filter(Boolean).forEach((file) => {
    const key = getImageFileSelectionKey(file);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(file);
  });
  return result;
};

export const getGalleryEntryAliases = (entry = {}) => [...new Set([
  String(entry?.path || '').trim(),
  String(entry?.url || '').trim()
].filter(Boolean))];

export const getGallerySignature = (gallery = []) => (Array.isArray(gallery) ? gallery : [])
  .map((entry) => getGalleryEntryAliases(entry)[0] || '')
  .join('\u001e');

const findGalleryEntry = (gallery, aliases) => {
  const aliasSet = new Set(aliases);
  return (Array.isArray(gallery) ? gallery : []).find((entry) => (
    getGalleryEntryAliases(entry).some((alias) => aliasSet.has(alias))
  )) || null;
};

/**
 * Rebuilds the server gallery after an async upload has appended new entries.
 * Saved entries are taken from the user's local draft; pending entries are
 * matched to the worker result by their stable file key. This keeps the
 * selected pending Primary deterministic without storing a second image copy.
 */
export const buildEditGalleryIntent = ({
  baseGallery = [],
  draftGallery = [],
  pendingFiles = [],
  pendingPrimaryFile = null
} = {}) => {
  const savedEntries = (Array.isArray(draftGallery) ? draftGallery : []).map((entry) => ({
    type: 'saved',
    path: entry?.path || null,
    url: entry?.url || null
  }));
  const pendingEntries = (Array.isArray(pendingFiles) ? pendingFiles : [])
    .filter(Boolean)
    .map((file) => ({ type: 'pending', key: getImageFileSelectionKey(file) }));
  const pendingPrimaryKey = pendingPrimaryFile
    ? getImageFileSelectionKey(pendingPrimaryFile)
    : '';
  const orderedEntries = pendingPrimaryKey
    ? [
      ...pendingEntries.filter((entry) => entry.key === pendingPrimaryKey),
      ...savedEntries,
      ...pendingEntries.filter((entry) => entry.key !== pendingPrimaryKey)
    ]
    : [...savedEntries, ...pendingEntries];

  return {
    base_keys: (Array.isArray(baseGallery) ? baseGallery : [])
      .map((entry) => getGalleryEntryAliases(entry)[0] || '')
      .filter(Boolean),
    entries: orderedEntries,
    pending_keys: pendingEntries.map((entry) => entry.key)
  };
};

export const buildFinalEditGallery = ({
  baseGallery = [],
  draftGallery = [],
  refreshedGallery = [],
  pendingFiles = [],
  pendingPrimaryFile = null
} = {}) => {
  const baseAliases = new Set((Array.isArray(baseGallery) ? baseGallery : [])
    .flatMap(getGalleryEntryAliases));
  const refreshed = Array.isArray(refreshedGallery) ? refreshedGallery : [];
  const pendingEntries = refreshed.filter((entry) => (
    !getGalleryEntryAliases(entry).some((alias) => baseAliases.has(alias))
  ));
  const savedEntries = (Array.isArray(draftGallery) ? draftGallery : [])
    .map((entry) => findGalleryEntry(refreshed, getGalleryEntryAliases(entry)))
    .filter(Boolean);
  const pendingPrimaryKey = pendingPrimaryFile
    ? getImageFileSelectionKey(pendingPrimaryFile)
    : '';
  const pendingPrimaryIndex = (Array.isArray(pendingFiles) ? pendingFiles : [])
    .findIndex((file) => getImageFileSelectionKey(file) === pendingPrimaryKey);
  const pendingPrimaryEntry = pendingPrimaryIndex >= 0
    ? pendingEntries[pendingPrimaryIndex] || null
    : null;
  const remainingPendingEntries = pendingEntries.filter((entry) => entry !== pendingPrimaryEntry);
  const ordered = pendingPrimaryEntry
    ? [pendingPrimaryEntry, ...savedEntries, ...remainingPendingEntries]
    : [...savedEntries, ...remainingPendingEntries];

  return {
    gallery: ordered.map((entry, index) => ({
      ...entry,
      is_primary: index === 0,
      sort_order: index
    })),
    pendingEntries
  };
};

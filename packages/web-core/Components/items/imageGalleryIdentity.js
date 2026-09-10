const FIELD_SEPARATOR = '\u001f';

export const getImageFileSelectionKey = (file) => [
  String(file?.name || '').trim(),
  Number(file?.size || 0),
  Number(file?.lastModified || 0),
  String(file?.type || '').trim().toLowerCase()
].join(FIELD_SEPARATOR);

export const getSavedGalleryEntryKey = (entry = {}, index = 0) => {
  const alias = String(entry?.path || entry?.url || '').trim();
  return `saved:${alias || `image-${index}`}`;
};

export const getPendingGalleryEntryKey = (file) => (
  `pending:${getImageFileSelectionKey(file)}`
);

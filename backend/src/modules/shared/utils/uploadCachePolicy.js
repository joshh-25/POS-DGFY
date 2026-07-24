import path from 'path';

const ONE_YEAR_SECONDS = 31_536_000;
const LEGACY_IMAGE_FRESH_SECONDS = 300;
const LEGACY_IMAGE_STALE_SECONDS = 86_400;
const OPTIMIZED_VARIANT_FILE_PATTERN = /^(?:thumb|medium|large)\.(?:avif|jpe?g|png|webp)$/i;
const VERSIONED_ASSET_FOLDER_PATTERN = /-\d{10,16}-[0-9a-f]{8}$/i;
const PUBLIC_RASTER_IMAGE_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;

export const isVersionedOptimizedUpload = (filePath) => {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) return false;

  const filename = path.basename(normalizedPath);
  const parentFolder = path.basename(path.dirname(normalizedPath));
  return (
    OPTIMIZED_VARIANT_FILE_PATTERN.test(filename)
    && VERSIONED_ASSET_FOLDER_PATTERN.test(parentFolder)
  );
};

export const resolveUploadCacheControl = (filePath) => {
  const normalizedPath = String(filePath || '').trim();
  if (isVersionedOptimizedUpload(normalizedPath)) {
    return `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
  }
  if (PUBLIC_RASTER_IMAGE_PATTERN.test(normalizedPath)) {
    return `public, max-age=${LEGACY_IMAGE_FRESH_SECONDS}, stale-while-revalidate=${LEGACY_IMAGE_STALE_SECONDS}`;
  }
  return 'no-cache';
};


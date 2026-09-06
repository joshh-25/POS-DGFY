/**
 * Builds the `client_image_manifest` JSON shape Phase 297's upload-contract work will consume.
 * Purely descriptive -- this phase never sends it over the wire (see rolloutFlag.js and
 * posCatalogService.js's minimal single-variant wiring, both scoped to this phase only).
 * Building the shape now means Phase 297 only has to wire the transport, not design it.
 */
export function buildVariantManifest({ sourceFile, variantMeta = {}, degraded = [] } = {}) {
  const variants = {};
  for (const [key, meta] of Object.entries(variantMeta)) {
    if (!meta) continue;
    variants[key] = {
      width: meta.width,
      height: meta.height,
      mimeType: meta.file?.type ?? null,
      bytes: meta.file?.size ?? null,
    };
  }

  return {
    schema: 'client-image-manifest/v1',
    source: {
      name: sourceFile?.name ?? null,
      mimeType: sourceFile?.type ?? null,
      bytes: sourceFile?.size ?? null,
    },
    variants,
    degraded: [...degraded],
    generatedAt: new Date().toISOString(),
  };
}

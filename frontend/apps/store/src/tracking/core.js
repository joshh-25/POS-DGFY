export function createTrackingAdapterRegistry(adapters = []) {
  const safeAdapters = Array.isArray(adapters) ? adapters.filter(Boolean) : [];
  return {
    adapters: safeAdapters,
    resolve(input) {
      return safeAdapters.find((adapter) => typeof adapter.canHandle === 'function' && adapter.canHandle(input)) || null;
    }
  };
}

export async function fetchNormalizedTrackingEntity({
  registry,
  input,
  requestJson
}) {
  if (!registry || typeof registry.resolve !== 'function') return null;
  const adapter = registry.resolve(input);
  if (!adapter) return null;
  const raw = await adapter.fetch(input, { requestJson, storeSlug: input?.storeSlug });
  const normalized = adapter.normalize(raw, input);
  return {
    adapterMode: adapter.mode,
    raw,
    normalized
  };
}


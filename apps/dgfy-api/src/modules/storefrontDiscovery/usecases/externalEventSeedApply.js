import { buildSaveExternalListingUseCase } from './externalRedirectUseCases.js';
import { validateExternalEventSeed } from '../domain/externalEventSeedMapping.js';

export const applyExternalEventSeed = async ({ seed, repository, apply = false, log = () => {} }) => {
  validateExternalEventSeed(seed);
  const providers = [...new Set(seed.listings.map((row) => row.external_provider))];
  const sites = await Promise.all(providers.map(async (provider) => [provider, await repository.getSite(provider)]));
  const missingSites = sites.filter(([, site]) => !site?.enabled).map(([provider]) => provider);
  if (missingSites.length) log(`Configure and enable Admin sites: ${missingSites.join(', ')}`);
  const totals = { created: 0, updated: 0, failed: 0, dryRun: !apply, missingSites };
  if (!apply) {
    seed.listings.forEach((row) => log(`dry-run ${row.slug}`));
    return totals;
  }
  const save = buildSaveExternalListingUseCase({ repository });
  for (const row of seed.listings) {
    if (missingSites.includes(row.external_provider)) {
      totals.failed += 1;
      log(`failed ${row.slug}: site disabled`);
      continue;
    }
    try {
      const result = await save({
        slug: row.slug,
        payload: { ...row, external_record_origin: 'event_seed', is_visible: true },
        admin: { id: null, username: 'external-event-seed-script' }
      });
      if (!result.success) throw new Error(result.error?.message || 'save rejected');
      totals[result.data.status] += 1;
      log(`${result.data.status} ${row.slug}`);
    } catch (error) {
      totals.failed += 1;
      log(`failed ${row.slug}: ${error.message}`);
    }
  }
  return totals;
};

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_SEED_SCHEMA, extractExternalEventSeed } from '../src/modules/storefrontDiscovery/domain/externalEventSeedMapping.js';
import { applyExternalEventSeed } from '../src/modules/storefrontDiscovery/usecases/externalEventSeedApply.js';

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  const options = { mapviu: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === '--apply') { options.apply = true; continue; }
    if (!['--synqcore', '--mapviu', '--proventus', '--out', '--file'].includes(flag) || !rest[i + 1]) {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
    const key = flag.slice(2);
    if (key === 'mapviu') options.mapviu.push(rest[++i]);
    else {
      if (key === 'proventus' && options.proventus) throw new Error('--proventus may be provided only once');
      options[key] = rest[++i];
    }
  }
  return { command, options };
};

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const main = async () => {
  const { command, options } = parseArgs(process.argv.slice(2));
  const hasExtractSource = Boolean(options.synqcore || options.mapviu.length || options.proventus);
  if (command === 'extract' && hasExtractSource && options.out && !options.apply && !options.file) {
    const extractionInput = {};
    const sources = [];
    if (options.synqcore) {
      const synqcoreExport = await readJson(options.synqcore);
      extractionInput.synqcoreExport = synqcoreExport;
      sources.push({ provider: 'synqcore', file: basename(options.synqcore), exported_at: synqcoreExport.metadata?.exported_at_utc || null });
    }
    if (options.mapviu.length) {
      extractionInput.mapviuExports = await Promise.all(options.mapviu.map(readJson));
      sources.push(...options.mapviu.map((path) => ({ provider: 'mapviu', file: basename(path), exported_at: null })));
    }
    if (options.proventus) {
      extractionInput.proventusExports = await readJson(options.proventus);
      sources.push({ provider: 'proventus', file: basename(options.proventus), exported_at: null });
    }
    const { listings, skipped } = extractExternalEventSeed(extractionInput);
    const seed = {
      schema: EVENT_SEED_SCHEMA,
      generated_at: new Date().toISOString(),
      sources,
      listings, skipped
    };
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(seed, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    console.log(`Extracted ${listings.length} listings; skipped ${skipped.length}. Output: ${options.out}`);
    return;
  }
  if (command === 'apply' && options.file && !options.synqcore && !options.mapviu.length
    && !options.proventus && !options.out) {
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
    const { externalRedirectRepository } = await import('../src/modules/storefrontDiscovery/repositories/externalRedirectRepository.js');
    const { sequelize } = await import('../src/models/index.js');
    try {
      const totals = await applyExternalEventSeed({ seed: await readJson(options.file), repository: externalRedirectRepository, apply: options.apply, log: console.log });
      console.log(JSON.stringify(totals));
      if (totals.failed || (options.apply && totals.missingSites.length)) process.exitCode = 1;
    } finally {
      await sequelize.close();
    }
    return;
  }
  throw new Error('Usage: extract [--synqcore <json>] [--mapviu <json> ...] [--proventus <json>] --out <file> | apply --file <minimal.json> [--apply]');
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

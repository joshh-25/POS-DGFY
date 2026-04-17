import { runTenantRedundantIndexRemediation } from './remediate-tenant-redundant-indexes.js';

const parseArgs = (argv = process.argv.slice(2)) => {
  const options = {
    apply: false,
    yes: false,
    tenantDb: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--yes') {
      options.yes = true;
      continue;
    }
    if (arg === '--tenant-db') {
      options.tenantDb = argv[i + 1] || '';
      i += 1;
    }
  }

  return options;
};

const main = async () => {
  const args = parseArgs();
  console.log(
    '[cleanup-duplicate-indexes] This script now delegates to remediate-tenant-redundant-indexes.js with dry-run default.'
  );
  await runTenantRedundantIndexRemediation({
    apply: args.apply,
    yes: args.yes,
    tenantDb: args.tenantDb
  });
};

main().catch((error) => {
  console.error(`[cleanup-duplicate-indexes] fatal: ${error.message}`);
  process.exit(1);
});

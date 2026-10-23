import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const AUDIT_ARCHIVE_INCLUDE_PATHS = Object.freeze([
  'apps/dgfy-api/src',
  'apps/dgfy-api/scripts',
  'apps/dgfy-api/tests',
  'apps/dgfy-api/package.json',
  'apps/dgfy-migration-runner/migrations',
  'apps/dgfy-migration-runner/package.json',
  'apps/dgfy-opis/src',
  'apps/dgfy-opis/tests',
  'apps/dgfy-opis/package.json',
  'apps/dgfy-pos/src',
  'apps/dgfy-pos/tests',
  'apps/dgfy-pos/package.json',
  'apps/dgfy-storefront/src',
  'apps/dgfy-storefront/tests',
  'apps/dgfy-storefront/package.json',
  'packages/shared-constants/src',
  'packages/shared-constants/package.json',
  'packages/web-core/src',
  'packages/web-core/Components',
  'packages/web-core/package.json'
]);

// These are pathspec exclusions, so the archive cannot accidentally include a local
// credential file, session state, private uploads, generated bundles, or dependency tree.
export const AUDIT_ARCHIVE_EXCLUDE_PATHS = Object.freeze([
  ':(exclude)**/.env',
  ':(exclude)**/.env.*',
  ':(exclude)**/CREDENTIALS.md',
  ':(exclude)**/*Credential*',
  ':(exclude)**/*credential*',
  ':(exclude)**/*Credentials*',
  ':(exclude)**/*credentials*',
  ':(exclude)**/*Secrets*',
  ':(exclude)**/*secret*',
  ':(exclude)**/*token*.json',
  ':(exclude)**/private-uploads/**',
  ':(exclude)**/playwright/.auth/**',
  ':(exclude)**/test-results/**',
  ':(exclude)**/playwright-report/**',
  ':(exclude)**/dist/**',
  ':(exclude)**/node_modules/**',
  ':(exclude)**/*.pem',
  ':(exclude)**/*.key',
  ':(exclude)**/*Token*.json'
]);

const parseArgs = (argv) => {
  const options = { outputDir: path.join(repoRoot, 'artifacts', 'code-audits'), ref: 'HEAD', name: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output-dir') options.outputDir = argv[++index] || options.outputDir;
    else if (argument === '--ref') options.ref = argv[++index] || options.ref;
    else if (argument === '--name') options.name = argv[++index] || options.name;
    else if (argument === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
};

const resolveCommit = (ref) => execFileSync(
  'git',
  ['rev-parse', '--verify', `${ref}^{commit}`],
  { cwd: repoRoot, encoding: 'utf8' }
).trim();

export const createCodeAuditArchive = ({ outputDir, ref = 'HEAD', name = '' }) => {
  const commit = resolveCommit(ref);
  const resolvedOutputDir = path.resolve(repoRoot, outputDir || path.join('artifacts', 'code-audits'));
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  const archiveName = name || `dgfy-code-audit-${commit.slice(0, 12)}.zip`;
  if (!/^[A-Za-z0-9._-]+\.zip$/i.test(archiveName)) {
    throw new Error(`Archive name must be a simple .zip filename: ${archiveName}`);
  }
  const outputPath = path.join(resolvedOutputDir, archiveName);
  execFileSync(
    'git',
    [
      'archive',
      '--format=zip',
      `--output=${outputPath}`,
      commit,
      '--',
      ...AUDIT_ARCHIVE_INCLUDE_PATHS,
      ...AUDIT_ARCHIVE_EXCLUDE_PATHS
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  return { outputPath, commit, includedRoots: AUDIT_ARCHIVE_INCLUDE_PATHS, excludedPaths: AUDIT_ARCHIVE_EXCLUDE_PATHS };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/create-code-audit-archive.mjs [--ref REF] [--output-dir DIR] [--name FILE.zip]');
    } else {
      const result = createCodeAuditArchive(options);
      console.log(`[CodeAuditArchive] created ${result.outputPath}`);
      console.log(`[CodeAuditArchive] ref=${result.commit}`);
      console.log('[CodeAuditArchive] sensitive/session/generated paths excluded');
    }
  } catch (error) {
    console.error(`[CodeAuditArchive] failed: ${error.message}`);
    process.exitCode = 1;
  }
}

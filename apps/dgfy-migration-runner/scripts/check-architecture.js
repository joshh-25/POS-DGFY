#!/usr/bin/env node
/**
 * Migration-runner architecture guardrail (WR-04, phase 06 code review).
 *
 * `apps/dgfy-migration-runner/src/` does not use the layered
 * `modules/{name}/{controllers,usecases,repositories,entities}` shape that
 * `backend/scripts/check-architecture-guardrails.js` enforces (it is a flat,
 * concern-organized tree: commands/, config/, data/, metadata/, migrations/,
 * reports/, safety/, schema/, schemaContracts/, utils/), so that script's
 * module-structure/controller-naming/import-boundary rules do not apply
 * here. This is a small, purpose-built guardrail instead.
 *
 * The one rule enforced: DB connections must only ever be constructed via
 * the factory functions in `src/config/db.js` (Phase 1 must-have #3 — "DB
 * connection objects are never constructed at module import time — only
 * inside command handlers after validation passes"). No other file under
 * `src/` may call `new Sequelize(` directly. `src/config/db.js` itself is
 * the sole allowed construction site and is excluded from the scan.
 *
 * Verified zero-false-positive today via `grep -rln "new Sequelize("
 * apps/dgfy-migration-runner/src/` — all five call sites live in
 * `src/config/db.js`. This guardrail exists to catch a *future* regression
 * (a new file bypassing the factory pattern), not a currently-known issue.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const SEQUELIZE_CONSTRUCTION_PATTERN = /new\s+Sequelize\s*\(/;

// Relative to the package root (apps/dgfy-migration-runner), posix-style.
const DEFAULT_ALLOWED_CONSTRUCTION_FILES = new Set(['src/config/db.js']);

const toPosixPath = (inputPath) => inputPath.replace(/\\/g, '/');

const collectJsFiles = (directoryPath, out = []) => {
    if (!fs.existsSync(directoryPath)) return out;

    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(absolutePath, out);
            continue;
        }

        if (!entry.isFile()) continue;
        if (!absolutePath.endsWith('.js')) continue;

        out.push(absolutePath);
    }

    return out;
};

/**
 * Scans every `.js` file under `srcRoot` (default: `<packageRoot>/src`) for
 * a direct `new Sequelize(` construction outside the allowed factory file.
 *
 * @param {object} [options]
 * @param {string} [options.srcRoot] absolute path to the source tree to scan
 * @param {string} [options.root] absolute path used to compute relative
 *   paths for both the scan output and the allowlist (defaults to the
 *   migration-runner package root)
 * @param {Set<string>} [options.allowedConstructionFiles] posix-style,
 *   root-relative file paths permitted to construct `new Sequelize(`
 * @returns {{ fileCount: number, violations: string[] }}
 */
export const scanForDirectSequelizeConstruction = ({
    srcRoot,
    root = packageRoot,
    allowedConstructionFiles = DEFAULT_ALLOWED_CONSTRUCTION_FILES
} = {}) => {
    const resolvedSrcRoot = srcRoot || path.join(root, 'src');
    const files = collectJsFiles(resolvedSrcRoot);

    const violations = [];

    files.forEach((absolutePath) => {
        const relativePath = toPosixPath(path.relative(root, absolutePath));
        if (allowedConstructionFiles.has(relativePath)) return;

        const source = fs.readFileSync(absolutePath, 'utf8');
        if (SEQUELIZE_CONSTRUCTION_PATTERN.test(source)) {
            violations.push(`${relativePath} constructs \`new Sequelize(\` directly — use a factory from src/config/db.js instead`);
        }
    });

    return { fileCount: files.length, violations };
};

const printViolations = (violations) => {
    if (violations.length === 0) return false;

    console.error('[ArchitectureGuardrails:migration-runner] Violations detected:');
    console.error('\n[directSequelizeConstruction]');
    violations.forEach((entry) => console.error(` - ${entry}`));

    return true;
};

const run = () => {
    const { fileCount, violations } = scanForDirectSequelizeConstruction();
    const failed = printViolations(violations);

    if (failed) {
        process.exit(1);
    }

    console.log(`[ArchitectureGuardrails:migration-runner] OK. Checked ${fileCount} files.`);
};

const isMainModule = () => {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(process.argv[1]).href;
};

if (isMainModule()) {
    run();
}

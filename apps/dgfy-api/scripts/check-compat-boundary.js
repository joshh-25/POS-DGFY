import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// CMP-03: the canonical domain layer (entities/usecases) must never import
// compatibility/continuity code. Standalone, apps/dgfy-api-only checker —
// forked out of backend/scripts/check-architecture-guardrails.js (which
// previously carried this scan under D-05a/D-05b) so backend/ stays
// completely untouched, per the same scope boundary that already keeps
// architectureGuardrailsAllowlist.js living here instead of under backend/.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');

const COMPAT_IMPORT_PATTERN = /from\s+['"][^'"]*\/(continuity|compat)(?:\/[^'"]*)?['"]/g;

const toPosixPath = (inputPath) => inputPath.replace(/\\/g, '/');

const resolveFromApiRoot = (candidate) => (
    path.isAbsolute(candidate)
        ? candidate
        : path.resolve(apiRoot, candidate)
);

const collectCodeFiles = (directoryPath, out = []) => {
    if (!fs.existsSync(directoryPath)) return out;

    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            collectCodeFiles(absolutePath, out);
            continue;
        }

        if (!entry.isFile()) continue;
        if (!absolutePath.endsWith('.js') && !absolutePath.endsWith('.mjs') && !absolutePath.endsWith('.cjs')) continue;

        out.push({
            absolutePath,
            relativePath: toPosixPath(path.relative(apiRoot, absolutePath))
        });
    }

    return out;
};

const readCompatAllowlist = async () => {
    const allowlistPath = resolveFromApiRoot(
        process.env.ARCH_GUARDRAIL_ALLOWLIST_PATH || 'src/config/architectureGuardrailsAllowlist.js'
    );

    if (!fs.existsSync(allowlistPath)) return new Set();

    const allowlistUrl = pathToFileURL(allowlistPath).href;
    const loadedModule = await import(allowlistUrl);
    const compatImportRaw = loadedModule.ARCHITECTURE_COMPAT_IMPORT_ALLOWLIST || [];

    if (!Array.isArray(compatImportRaw)) {
        throw new Error(`Invalid compat-import allowlist at ${allowlistPath}. Expected an array export.`);
    }

    return new Set(compatImportRaw.map((entry) => toPosixPath(entry)));
};

const getModulesRoot = () => resolveFromApiRoot(
    process.env.ARCH_GUARDRAIL_MODULES_ROOT || 'src/modules'
);

const hasPattern = (pattern, source) => {
    const matched = pattern.test(source);
    pattern.lastIndex = 0;
    return matched;
};

const collectViolations = (modulesRoot, compatAllowlist) => {
    const moduleDirs = fs.readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());

    const violations = { domainCompatLeak: [] };
    let scannedFileCount = 0;

    moduleDirs.forEach((moduleDir) => {
        const moduleAbsolutePath = path.join(modulesRoot, moduleDir.name);

        ['entities', 'usecases'].forEach((layerDir) => {
            const layerFiles = collectCodeFiles(path.join(moduleAbsolutePath, layerDir));
            scannedFileCount += layerFiles.length;

            layerFiles.forEach((file) => {
                const source = fs.readFileSync(file.absolutePath, 'utf8');
                if (hasPattern(COMPAT_IMPORT_PATTERN, source) && !compatAllowlist.has(file.relativePath)) {
                    violations.domainCompatLeak.push(`${file.relativePath} imports compatibility/continuity code`);
                }
            });
        });
    });

    return { moduleCount: moduleDirs.length, fileCount: scannedFileCount, violations };
};

const printViolations = (violations) => {
    const sections = Object.entries(violations).filter(([, list]) => list.length > 0);
    if (sections.length === 0) return false;

    console.error('[CompatBoundaryGuardrail] Violations detected:');

    sections.forEach(([section, list]) => {
        console.error(`\n[${section}]`);
        list.forEach((entry) => console.error(` - ${entry}`));
    });

    return true;
};

const run = async () => {
    const modulesRoot = getModulesRoot();
    if (!fs.existsSync(modulesRoot)) {
        throw new Error(`Modules root not found: ${modulesRoot}`);
    }

    const compatAllowlist = await readCompatAllowlist();
    const { moduleCount, fileCount, violations } = collectViolations(modulesRoot, compatAllowlist);
    const failed = printViolations(violations);

    if (failed) {
        process.exit(1);
    }

    console.log(`[CompatBoundaryGuardrail] OK. Checked ${moduleCount} modules and ${fileCount} entities/usecases files.`);
};

run().catch((error) => {
    console.error('[CompatBoundaryGuardrail] Failed:', error.message);
    process.exit(1);
});

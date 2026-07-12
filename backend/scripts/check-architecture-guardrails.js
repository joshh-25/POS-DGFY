import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const MODEL_IMPORT_PATTERN = /from\s+['"][^'"]*\/models(?:\/[^'"]*)?['"]/g;
const LEGACY_SERVICE_IMPORT_PATTERN = /from\s+['"][^'"]*\/services(?:\/[^'"]*)?['"]/g;
// CMP-03: the canonical domain layer (entities/usecases) must never import
// compatibility/continuity code (Phase 5, 05-02-PLAN.md, D-05a/D-05b).
const COMPAT_IMPORT_PATTERN = /from\s+['"][^'"]*\/(continuity|compat)(?:\/[^'"]*)?['"]/g;
const CONTROLLER_FILE_SUFFIX = 'Handlers.js';

const REQUIRED_MODULE_FILES = ['index.js', 'README.md'];
const REQUIRED_LAYER_DIRS = ['controllers', 'usecases', 'repositories'];

const toPosixPath = (inputPath) => inputPath.replace(/\\/g, '/');

const resolveFromBackendRoot = (candidate) => (
    path.isAbsolute(candidate)
        ? candidate
        : path.resolve(backendRoot, candidate)
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
            relativePath: toPosixPath(path.relative(backendRoot, absolutePath))
        });
    }

    return out;
};

const readBoundaryAllowlist = async () => {
    const allowlistPath = resolveFromBackendRoot(
        process.env.ARCH_GUARDRAIL_ALLOWLIST_PATH || 'src/config/architectureGuardrailsAllowlist.js'
    );

    if (!fs.existsSync(allowlistPath)) {
        return {
            controllerNaming: new Set(),
            usecaseLegacyServiceImports: new Set(),
            compatImport: new Set()
        };
    }

    const allowlistUrl = pathToFileURL(allowlistPath).href;
    const loadedModule = await import(allowlistUrl);
    const controllerNamingRaw = loadedModule.ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST || [];
    const usecaseServiceRaw = loadedModule.ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST || [];
    const compatImportRaw = loadedModule.ARCHITECTURE_COMPAT_IMPORT_ALLOWLIST || [];

    if (!Array.isArray(controllerNamingRaw) || !Array.isArray(usecaseServiceRaw) || !Array.isArray(compatImportRaw)) {
        throw new Error(`Invalid architecture guardrail boundary allowlist at ${allowlistPath}. Expected array exports.`);
    }

    return {
        controllerNaming: new Set(controllerNamingRaw.map((entry) => toPosixPath(entry))),
        usecaseLegacyServiceImports: new Set(usecaseServiceRaw.map((entry) => toPosixPath(entry))),
        compatImport: new Set(compatImportRaw.map((entry) => toPosixPath(entry)))
    };
};

const readAllowlist = async () => {
    const allowlistPath = resolveFromBackendRoot(
        process.env.ARCH_GUARDRAIL_MODEL_IMPORT_ALLOWLIST_PATH || 'src/config/architectureModelImportAllowlist.js'
    );

    const allowlistUrl = pathToFileURL(allowlistPath).href;
    const loadedModule = await import(allowlistUrl);
    const allowlist = loadedModule.ARCHITECTURE_MODEL_IMPORT_ALLOWLIST || loadedModule.default;

    if (!Array.isArray(allowlist)) {
        throw new Error(`Invalid architecture guardrail allowlist at ${allowlistPath}. Expected array export.`);
    }

    return new Set(allowlist.map((entry) => toPosixPath(entry)));
};

const getModulesRoot = () => resolveFromBackendRoot(
    process.env.ARCH_GUARDRAIL_MODULES_ROOT || 'src/modules'
);

const hasPattern = (pattern, source) => {
    const matched = pattern.test(source);
    pattern.lastIndex = 0;
    return matched;
};

const isRepositoryFile = (relativePath) => relativePath.includes('/repositories/');

const collectViolations = (modulesRoot, allowlist, boundaryAllowlist) => {
    const moduleDirs = fs.readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());

    const violations = {
        moduleStructure: [],
        controllerNaming: [],
        usecaseLayerLeak: [],
        modelImportBoundary: [],
        domainCompatLeak: []
    };

    const allModuleFiles = [];

    moduleDirs.forEach((moduleDir) => {
        const moduleName = moduleDir.name;
        const moduleAbsolutePath = path.join(modulesRoot, moduleName);
        const moduleRelativePath = toPosixPath(path.relative(backendRoot, moduleAbsolutePath));
        const moduleEntries = fs.readdirSync(moduleAbsolutePath, { withFileTypes: true });

        REQUIRED_MODULE_FILES.forEach((requiredFile) => {
            const exists = moduleEntries.some((entry) => entry.isFile() && entry.name === requiredFile);
            if (!exists) {
                violations.moduleStructure.push(`${moduleRelativePath} missing required file ${requiredFile}`);
            }
        });

        const hasLayerDirectory = REQUIRED_LAYER_DIRS.some((layerDir) => (
            moduleEntries.some((entry) => entry.isDirectory() && entry.name === layerDir)
        ));

        if (!hasLayerDirectory) {
            violations.moduleStructure.push(`${moduleRelativePath} missing required layer directories (${REQUIRED_LAYER_DIRS.join(', ')})`);
        }

        const moduleFiles = collectCodeFiles(moduleAbsolutePath);
        allModuleFiles.push(...moduleFiles);

        const controllerDirectory = path.join(moduleAbsolutePath, 'controllers');
        const controllerFiles = collectCodeFiles(controllerDirectory);
        controllerFiles.forEach((file) => {
            const fileName = path.basename(file.relativePath);
            if (fileName === 'index.js') return;
            if (boundaryAllowlist.controllerNaming.has(file.relativePath)) return;
            if (!fileName.endsWith(CONTROLLER_FILE_SUFFIX)) {
                violations.controllerNaming.push(`${file.relativePath} should end with ${CONTROLLER_FILE_SUFFIX}`);
            }
        });

        const usecaseDirectory = path.join(moduleAbsolutePath, 'usecases');
        const usecaseFiles = collectCodeFiles(usecaseDirectory);
        usecaseFiles.forEach((file) => {
            const source = fs.readFileSync(file.absolutePath, 'utf8');
            if (hasPattern(MODEL_IMPORT_PATTERN, source)) {
                violations.usecaseLayerLeak.push(`${file.relativePath} imports models directly`);
            }
            if (hasPattern(LEGACY_SERVICE_IMPORT_PATTERN, source) && !boundaryAllowlist.usecaseLegacyServiceImports.has(file.relativePath)) {
                violations.usecaseLayerLeak.push(`${file.relativePath} imports legacy services directly`);
            }
            if (hasPattern(COMPAT_IMPORT_PATTERN, source) && !boundaryAllowlist.compatImport.has(file.relativePath)) {
                violations.domainCompatLeak.push(`${file.relativePath} imports compatibility/continuity code`);
            }
        });

        // RESEARCH Pitfall 3: entities/ was previously unscanned, allowing a
        // compat/continuity import to enter the domain layer undetected.
        const entitiesDirectory = path.join(moduleAbsolutePath, 'entities');
        const entitiesFiles = collectCodeFiles(entitiesDirectory);
        entitiesFiles.forEach((file) => {
            const source = fs.readFileSync(file.absolutePath, 'utf8');
            if (hasPattern(COMPAT_IMPORT_PATTERN, source) && !boundaryAllowlist.compatImport.has(file.relativePath)) {
                violations.domainCompatLeak.push(`${file.relativePath} imports compatibility/continuity code`);
            }
        });
    });

    allModuleFiles.forEach((file) => {
        const source = fs.readFileSync(file.absolutePath, 'utf8');
        const hasModelImport = hasPattern(MODEL_IMPORT_PATTERN, source);
        if (!hasModelImport) return;

        if (isRepositoryFile(file.relativePath)) return;
        if (allowlist.has(file.relativePath)) return;

        violations.modelImportBoundary.push(`${file.relativePath} imports models outside repositories`);
    });

    return {
        moduleCount: moduleDirs.length,
        fileCount: allModuleFiles.length,
        violations
    };
};

const printViolations = (violations) => {
    const sections = Object.entries(violations).filter(([, list]) => list.length > 0);
    if (sections.length === 0) return false;

    console.error('[ArchitectureGuardrails] Violations detected:');

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

    const allowlist = await readAllowlist();
    const boundaryAllowlist = await readBoundaryAllowlist();
    const { moduleCount, fileCount, violations } = collectViolations(modulesRoot, allowlist, boundaryAllowlist);
    const failed = printViolations(violations);

    if (failed) {
        process.exit(1);
    }

    console.log(`[ArchitectureGuardrails] OK. Checked ${moduleCount} modules and ${fileCount} code files.`);
};

run().catch((error) => {
    console.error('[ArchitectureGuardrails] Failed:', error.message);
    process.exit(1);
});

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const CONTROLLER_MODEL_IMPORT_PATTERN = /from\s+['"][^'"]*\/models(?:\/[^'"]*)?['"]/g;

const toPosixPath = (filePath) => filePath.replace(/\\/g, '/');

const resolveFromBackendRoot = (candidate) => (
    path.isAbsolute(candidate)
        ? candidate
        : path.resolve(backendRoot, candidate)
);

const readAllowlist = async () => {
    const allowlistPath = resolveFromBackendRoot(
        process.env.CONTROLLER_BOUNDARY_ALLOWLIST_PATH || 'src/config/controllerModelImportAllowlist.js'
    );

    const allowlistUrl = pathToFileURL(allowlistPath).href;
    const loadedModule = await import(allowlistUrl);
    const allowlist = loadedModule.CONTROLLER_MODEL_IMPORT_ALLOWLIST || loadedModule.default;

    if (!Array.isArray(allowlist)) {
        throw new Error(`Invalid controller boundary allowlist at ${allowlistPath}. Expected array export.`);
    }

    return new Set(allowlist.map((entry) => toPosixPath(entry)));
};

const collectControllerFiles = (directoryPath, out = []) => {
    if (!fs.existsSync(directoryPath)) return out;

    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            collectControllerFiles(absolutePath, out);
            continue;
        }

        if (!entry.isFile() || !absolutePath.endsWith('.js')) {
            continue;
        }

        const relativePath = toPosixPath(path.relative(backendRoot, absolutePath));
        if (relativePath.includes('/controllers/')) {
            out.push({ absolutePath, relativePath });
        }
    }

    return out;
};

const listBoundaryTargets = () => {
    const rawTargets = process.env.CONTROLLER_BOUNDARY_TARGETS || 'src/controllers,src/modules';
    return rawTargets
        .split(',')
        .map((target) => target.trim())
        .filter(Boolean)
        .map(resolveFromBackendRoot);
};

const run = async () => {
    const allowlist = await readAllowlist();
    const targets = listBoundaryTargets();
    const files = targets.flatMap((target) => collectControllerFiles(target));
    const violations = [];

    files.forEach(({ absolutePath, relativePath }) => {
        const source = fs.readFileSync(absolutePath, 'utf8');
        const hasModelImport = CONTROLLER_MODEL_IMPORT_PATTERN.test(source);
        CONTROLLER_MODEL_IMPORT_PATTERN.lastIndex = 0;

        if (!hasModelImport) return;
        if (allowlist.has(relativePath)) return;

        violations.push(relativePath);
    });

    if (violations.length > 0) {
        console.error('[ControllerBoundary] Model import violations found:');
        violations.forEach((filePath) => {
            console.error(` - ${filePath}`);
        });
        process.exit(1);
    }

    console.log(`[ControllerBoundary] OK. Checked ${files.length} controller files with no unauthorized model imports.`);
};

run().catch((error) => {
    console.error('[ControllerBoundary] Failed:', error.message);
    process.exit(1);
});

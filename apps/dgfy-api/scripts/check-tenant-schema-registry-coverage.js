import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import {
    REQUIRED_TENANT_SCHEMA_COLUMNS,
    REQUIRED_TENANT_SCHEMA_TABLES
} from './sync-tenant-schemas.js';
import { NON_TENANT_MODEL_EXPORTS } from '../src/utils/tenantModelFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

const MODELS_ROOT = process.env.TENANT_SCHEMA_COVERAGE_MODELS_ROOT
    ? path.resolve(process.env.TENANT_SCHEMA_COVERAGE_MODELS_ROOT)
    : path.join(backendRoot, 'src/models');

const EXEMPTIONS_PATH = process.env.TENANT_SCHEMA_COVERAGE_EXEMPTIONS_PATH
    ? path.resolve(process.env.TENANT_SCHEMA_COVERAGE_EXEMPTIONS_PATH)
    : path.join(backendRoot, 'src/config/tenantSchemaCoverageExemptions.js');

const MIGRATIONS_PATH_PATTERN = /^apps\/dgfy-migration-runner\/migrations\/.+\.c?js$/;

// --- 1. Changed-file resolution -- mirrors scripts/check-compliance-impact.js's
//    fallback chain: env override, --staged, GITHUB_BASE_REF merge-base, the
//    before-SHA, HEAD~1, so CI and local pre-commit both work. -------------

const runCommand = (command, { allowFail = false } = {}) => {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: path.resolve(backendRoot, '..') }).trim();
    } catch (error) {
        if (allowFail) return '';
        throw error;
    }
};

const splitLines = (raw) => (
    String(raw || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
);

const unique = (values) => [...new Set(values)];

const parseChangedFilesFromEnv = (value) => (
    String(value || '')
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
);

export const resolveChangedFiles = ({ useStaged = false } = {}) => {
    if (useStaged) {
        const stagedFromEnv = parseChangedFilesFromEnv(process.env.TENANT_SCHEMA_COVERAGE_CHANGED_FILES);
        if (stagedFromEnv.length > 0) return unique(stagedFromEnv);
        return unique(splitLines(runCommand('git diff --cached --name-only', { allowFail: true })));
    }

    const fromEnv = parseChangedFilesFromEnv(process.env.TENANT_SCHEMA_COVERAGE_CHANGED_FILES);
    if (fromEnv.length > 0) return unique(fromEnv);

    let files = [];
    const baseRef = process.env.GITHUB_BASE_REF;
    if (baseRef) {
        runCommand(`git fetch --no-tags --prune --depth=200 origin ${baseRef}`, { allowFail: true });
        const mergeBase = runCommand(`git merge-base HEAD origin/${baseRef}`, { allowFail: true });
        if (mergeBase) {
            files = splitLines(runCommand(`git diff --name-only ${mergeBase}...HEAD`, { allowFail: true }));
        }
    }

    if (files.length === 0) {
        const beforeSha = process.env.GITHUB_EVENT_BEFORE || process.env.CI_COMMIT_BEFORE_SHA;
        if (beforeSha && !/^0+$/.test(beforeSha)) {
            files = splitLines(runCommand(`git diff --name-only ${beforeSha}...HEAD`, { allowFail: true }));
        }
    }

    if (files.length === 0) {
        files = splitLines(runCommand('git diff --name-only HEAD~1...HEAD', { allowFail: true }));
    }

    return unique(files);
};

// --- 2. tableName -> modelName map, built from apps/dgfy-api/src/models/**/*.js -
//    Handles both declaration styles used in this repo: flat/tenant models
//    via `sequelize.define('ModelName', {...}, { tableName: '...' })`, and
//    every file under models/Landlord/ via `class ModelName extends Model`
//    + `ModelName.init({...}, { tableName: '...' })`. A single left-to-right
//    pass per file, tracking the most recently seen model name, correctly
//    handles multi-define files like HospitalityModels.js too. ------------

const MODEL_DECLARATION_RE = /class\s+(\w+)\s+extends\s+Model\b|sequelize\.define\(\s*['"](\w+)['"]|tableName:\s*['"]([a-z0-9_]+)['"]/g;

export function collectModelFiles(modelsRoot, out = []) {
    if (!fs.existsSync(modelsRoot)) return out;
    for (const entry of fs.readdirSync(modelsRoot, { withFileTypes: true })) {
        const absolutePath = path.join(modelsRoot, entry.name);
        if (entry.isDirectory()) {
            collectModelFiles(absolutePath, out);
            continue;
        }
        if (entry.isFile() && absolutePath.endsWith('.js')) out.push(absolutePath);
    }
    return out;
}

export function extractTableModelPairsFromSource(source) {
    const pairs = [];
    let currentModelName = null;
    let match;
    MODEL_DECLARATION_RE.lastIndex = 0;
    while ((match = MODEL_DECLARATION_RE.exec(source)) !== null) {
        const [, classModelName, defineModelName, tableName] = match;
        if (classModelName) {
            currentModelName = classModelName;
        } else if (defineModelName) {
            currentModelName = defineModelName;
        } else if (tableName && currentModelName) {
            pairs.push({ table: tableName, model: currentModelName });
        }
    }
    return pairs;
}

export function buildTableToModelMap(modelFiles) {
    const map = new Map();
    for (const filePath of modelFiles) {
        const source = fs.readFileSync(filePath, 'utf8');
        for (const { table, model } of extractTableModelPairsFromSource(source)) {
            map.set(table, model);
        }
    }
    return map;
}

// --- 3. Migration parsing -- string-literal addColumn/createTable calls
//    only. A meaningful number of real migrations in this repo drive these
//    calls from variables/loops (confirmed by grep across all migrations),
//    which a regex cannot resolve reliably -- those are surfaced as
//    warnings, never silently skipped and never treated as failures. ------

const CREATE_TABLE_RE = /queryInterface\.createTable\(\s*(['"])([a-zA-Z0-9_]+)\1/g;
const ADD_COLUMN_RE = /queryInterface\.addColumn\(\s*(['"])([a-zA-Z0-9_]+)\1\s*,\s*(['"])([a-zA-Z0-9_]+)\3/g;
const NON_LITERAL_CALL_RE = /queryInterface\.(addColumn|createTable)\(\s*(?!['"])([A-Za-z0-9_.]+)/g;

export function extractMigrationSchemaOperations(source) {
    const createdTables = [];
    const addedColumns = [];
    const nonLiteralCalls = [];

    let match;
    CREATE_TABLE_RE.lastIndex = 0;
    while ((match = CREATE_TABLE_RE.exec(source)) !== null) createdTables.push(match[2]);

    ADD_COLUMN_RE.lastIndex = 0;
    while ((match = ADD_COLUMN_RE.exec(source)) !== null) addedColumns.push({ table: match[2], column: match[4] });

    NON_LITERAL_CALL_RE.lastIndex = 0;
    while ((match = NON_LITERAL_CALL_RE.exec(source)) !== null) {
        const line = source.slice(0, match.index).split('\n').length;
        nonLiteralCalls.push({ fn: match[1], arg: match[2], line });
    }

    return { createdTables, addedColumns, nonLiteralCalls };
}

// --- 4. Classification + exemptions ---------------------------------------

export function classifyTable(table, tableToModel, nonTenantModelExports = NON_TENANT_MODEL_EXPORTS) {
    const model = tableToModel.get(table);
    if (!model) return 'unmapped';
    return nonTenantModelExports.has(model) ? 'landlord' : 'tenant';
}

export async function loadExemptions(exemptionsPath = EXEMPTIONS_PATH) {
    if (!fs.existsSync(exemptionsPath)) return new Set();
    const loadedModule = await import(pathToFileURL(exemptionsPath).href);
    const raw = loadedModule.TENANT_SCHEMA_COVERAGE_EXEMPTIONS || loadedModule.default || [];
    if (!Array.isArray(raw)) {
        throw new Error(`Invalid tenant schema coverage exemptions at ${exemptionsPath}. Expected array export.`);
    }
    return new Set(raw);
}

const isExempt = (exemptions, table, column) => (
    exemptions.has(table) || (column ? exemptions.has(`${table}.${column}`) : false)
);

// --- 5. Coverage check -----------------------------------------------------

export function checkRegistryCoverage({
    migrations,
    tableToModel,
    nonTenantModelExports = NON_TENANT_MODEL_EXPORTS,
    exemptions = new Set(),
    requiredTables = REQUIRED_TENANT_SCHEMA_TABLES,
    requiredColumns = REQUIRED_TENANT_SCHEMA_COLUMNS
}) {
    const violations = [];
    const warnings = [];

    for (const { file, createdTables, addedColumns, nonLiteralCalls } of migrations) {
        const createdTableSet = new Set(createdTables);

        for (const table of createdTables) {
            const classification = classifyTable(table, tableToModel, nonTenantModelExports);
            if (classification === 'landlord') continue;
            if (isExempt(exemptions, table)) continue;
            if (!requiredTables?.[table]) {
                violations.push({
                    file,
                    table,
                    column: null,
                    classification,
                    message: `${file}: createTable('${table}') is ${classification === 'unmapped' ? 'not mapped to any model and' : 'tenant-scoped and'} has no entry in REQUIRED_TENANT_SCHEMA_TABLES (apps/dgfy-api/scripts/sync-tenant-schemas.js). Add a registry entry, or exempt it in apps/dgfy-api/src/config/tenantSchemaCoverageExemptions.js with a reason.`
                });
            }
        }

        for (const { table, column } of addedColumns) {
            // Table created in this same migration is already covered by the
            // table-level check above -- avoids a duplicate/false-positive
            // column violation on a migration that creates-then-populates its
            // own new table.
            if (createdTableSet.has(table)) continue;

            const classification = classifyTable(table, tableToModel, nonTenantModelExports);
            if (classification === 'landlord') continue;
            if (isExempt(exemptions, table, column)) continue;
            if (!requiredColumns?.[table]?.[column]) {
                violations.push({
                    file,
                    table,
                    column,
                    classification,
                    message: `${file}: addColumn('${table}', '${column}') is ${classification === 'unmapped' ? 'not mapped to any model and' : 'tenant-scoped and'} has no entry in REQUIRED_TENANT_SCHEMA_COLUMNS (apps/dgfy-api/scripts/sync-tenant-schemas.js). Add a registry entry, or exempt it in apps/dgfy-api/src/config/tenantSchemaCoverageExemptions.js with a reason.`
                });
            }
        }

        for (const { fn, arg, line } of nonLiteralCalls) {
            warnings.push({
                file,
                message: `${file}:${line}: queryInterface.${fn}(${arg}, ...) uses a non-literal table/column argument that this static check cannot resolve -- verify by hand whether it touches a tenant-scoped table and needs a registry entry.`
            });
        }
    }

    return { violations, warnings };
}

// --- 6. CLI entry -----------------------------------------------------------

async function run() {
    const useStaged = process.argv.includes('--staged');
    const changedFiles = resolveChangedFiles({ useStaged });
    const changedMigrationFiles = changedFiles.filter((file) => MIGRATIONS_PATH_PATTERN.test(file));

    if (changedMigrationFiles.length === 0) {
        console.log('[check:tenant-schema-coverage] No migration files changed.');
        return;
    }

    // Test hook: lets integration tests point migration file *contents* at a
    // fixture directory while `changedMigrationFiles` still carries realistic
    // repo-relative paths (for message/reporting purposes).
    const migrationsRootOverride = process.env.TENANT_SCHEMA_COVERAGE_MIGRATIONS_ROOT
        ? path.resolve(process.env.TENANT_SCHEMA_COVERAGE_MIGRATIONS_ROOT)
        : null;
    const repoRoot = path.resolve(backendRoot, '..');
    const migrations = changedMigrationFiles.map((relativePath) => {
        const absolutePath = migrationsRootOverride
            ? path.join(migrationsRootOverride, path.basename(relativePath))
            : path.join(repoRoot, relativePath);
        const source = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : '';
        return { file: relativePath, ...extractMigrationSchemaOperations(source) };
    });

    const tableToModel = buildTableToModelMap(collectModelFiles(MODELS_ROOT));
    const exemptions = await loadExemptions();

    const { violations, warnings } = checkRegistryCoverage({
        migrations,
        tableToModel,
        exemptions
    });

    if (warnings.length > 0) {
        console.warn('[check:tenant-schema-coverage] Warnings (could not be statically verified):');
        warnings.forEach((warning) => console.warn(`  - ${warning.message}`));
    }

    if (violations.length > 0) {
        console.error('[check:tenant-schema-coverage] Unregistered tenant-scoped schema changes detected:');
        violations.forEach((violation) => console.error(`  - ${violation.message}`));
        process.exitCode = 1;
        return;
    }

    console.log(`[check:tenant-schema-coverage] PASS. Checked ${changedMigrationFiles.length} changed migration file(s).`);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    run().catch((error) => {
        console.error('[check:tenant-schema-coverage] Fatal:', error.message);
        process.exit(1);
    });
}

/**
 * esmBarrelMock.js
 *
 * Builds a `jest.unstable_mockModule()` stub object from the REAL exported shape of an ES
 * module, instead of a hand-enumerated literal key list that silently rots the moment the real
 * module gains or loses an export (#1432 Phase 249: this recurred twice within 24h against
 * `src/modules/pos/index.js` / `src/controllers/posController.js`; #1441 Phase 250 flagged both
 * files as the only two in the suite that still hand-enumerate; #1450 Phase 251 is this fix).
 *
 * Every function here is a STATIC SOURCE-TEXT PARSER -- none of them `import()`/`require()` the
 * target module. The real POS barrel (`src/modules/pos/index.js`) transitively pulls in
 * `src/models/index.js` (1,316 lines, `new Sequelize(...)`) into the worker's module graph --
 * that's the #1432 OOM driver, and no fast-tier file imports it today. Parsing source text keeps
 * these helpers usable from a fast-tier file with `DB_PORT=1` and no DB connection at all.
 *
 * Usage:
 *   import { mockBarrel } from './helpers/esmBarrelMock.js';
 *   const mockCheckoutPosUseCase = jest.fn();
 *   mockBarrel(jest, '../src/modules/pos/index.js', {
 *       from: import.meta.url,
 *       overrides: { checkoutPosUseCase: mockCheckoutPosUseCase }
 *   });
 *   // every other export of index.js is auto-stubbed with jest.fn()
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const EXPORT_STAR_RE = /^[ \t]*export\s*\*/m;
const EXPORT_DEFAULT_RE = /^[ \t]*export\s+default\b/m;

// `export { a, b as c, ... } [from '...'];` -- possibly across multiple statements/lines.
const EXPORT_BLOCK_RE = /export\s*\{([^}]*)\}(?:\s*from\s*['"][^'"]+['"])?\s*;?/g;

// `export const|let|var name`, `export function name`, `export function* name`,
// `export async function name`, `export class name`.
const EXPORT_DECL_RE = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)|export\s+(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)|export\s+class\s+([A-Za-z_$][\w$]*)/g;

/**
 * Parses the named-export surface of a module's source text -- `export { ... }` blocks
 * (including `export { a as b }` and re-exports with a trailing `from '...'`) and inline
 * `export const|let|var|function|function*|class name` declarations.
 *
 * Throws on `export *` (can't enumerate a re-exported wildcard from source text alone) and on
 * `export default` (that's a different shape -- see `listDefaultExportKeys`).
 *
 * @param {string} source
 * @returns {string[]} exported names, in source order, de-duplicated
 */
function listNamedExports(source) {
    if (EXPORT_STAR_RE.test(source)) {
        throw new Error(
            'esmBarrelMock.listNamedExports: `export *` cannot be enumerated from source text -- '
            + 'enumerate the re-exported module\'s own named exports instead.'
        );
    }
    if (EXPORT_DEFAULT_RE.test(source)) {
        throw new Error(
            'esmBarrelMock.listNamedExports: this source has an `export default` -- use '
            + 'listDefaultExportKeys() for a default-export-object barrel instead.'
        );
    }

    const names = [];
    const seen = new Set();
    const add = (name) => {
        if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    };

    let match;
    EXPORT_BLOCK_RE.lastIndex = 0;
    while ((match = EXPORT_BLOCK_RE.exec(source))) {
        for (const rawSpecifier of match[1].split(',')) {
            const specifier = rawSpecifier.trim();
            if (!specifier) continue;
            const asMatch = specifier.match(/\bas\s+([A-Za-z_$][\w$]*)\s*$/);
            add(asMatch ? asMatch[1] : specifier.split(/\s+/)[0]);
        }
    }

    EXPORT_DECL_RE.lastIndex = 0;
    while ((match = EXPORT_DECL_RE.exec(source))) {
        add(match[1] || match[2] || match[3]);
    }

    return names;
}

/**
 * Brace-matched parse of a top-level `export default { ... }` object literal's own keys --
 * for a "compatibility facade" module like `src/controllers/posController.js`, whose default
 * export is a flat object of identifier-valued keys. Does not descend into nested object/array
 * values (a nested key never counts as a top-level export).
 *
 * @param {string} source
 * @returns {string[]} top-level keys, in source order, de-duplicated
 */
function listDefaultExportKeys(source) {
    const marker = /export\s+default\s*\{/.exec(source);
    if (!marker) {
        throw new Error(
            'esmBarrelMock.listDefaultExportKeys: no `export default { ... }` object literal found.'
        );
    }

    const openIndex = marker.index + marker[0].length - 1; // index of the opening '{'
    const closeIndex = findMatchingBrace(source, openIndex);
    const body = source.slice(openIndex + 1, closeIndex);

    const names = [];
    const seen = new Set();
    let depth = 0;
    let token = '';
    const flush = () => {
        const trimmed = token.trim();
        token = '';
        if (!trimmed) return;
        if (trimmed.startsWith('...')) {
            throw new Error(
                `esmBarrelMock.listDefaultExportKeys: spread element "${trimmed}" cannot be `
                + 'resolved from source text alone.'
            );
        }
        const explicitKey = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:/);
        const shorthandKey = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
        const name = explicitKey ? explicitKey[1] : (shorthandKey ? shorthandKey[1] : null);
        if (!name) {
            throw new Error(
                `esmBarrelMock.listDefaultExportKeys: could not parse a plain identifier key from `
                + `"${trimmed}".`
            );
        }
        if (!seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    };

    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        else if (ch === '}' || ch === ']' || ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            flush();
            continue;
        }
        token += ch;
    }
    flush();

    return names;
}

function findMatchingBrace(source, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error('esmBarrelMock: unbalanced braces while locating the `export default` block.');
}

function resolveFromSpecifier(specifier, fromUrl) {
    const fromPath = fileURLToPath(fromUrl);
    return path.resolve(path.dirname(fromPath), specifier);
}

/**
 * Reads `specifier` (resolved relative to `from`) and returns its export names -- named exports
 * if the source has no `export default`, otherwise the default export object's top-level keys.
 */
function listBarrelExports(absolutePath) {
    const source = readFileSync(absolutePath, 'utf8');
    return EXPORT_DEFAULT_RE.test(source) ? listDefaultExportKeys(source) : listNamedExports(source);
}

/**
 * Registers `jest.unstable_mockModule(specifier, ...)` with a stub object derived from the real
 * module's own export names: every name gets `overrides[name]` if provided, else
 * `defaultStub(name)` (a fresh `jest.fn()` by default).
 *
 * Throws if `overrides` names a key that isn't actually exported by the target module -- the
 * reverse of the rot this helper exists to prevent (a stale override nobody would otherwise
 * notice).
 *
 * @param {typeof import('@jest/globals').jest} jestObj
 * @param {string} specifier - module specifier, exactly as it would be `import`ed by the file
 *   under test (this is also what gets passed to `jest.unstable_mockModule`)
 * @param {object} options
 * @param {string} options.from - `import.meta.url` of the calling test file, used to resolve
 *   `specifier` to a real file on disk to parse
 * @param {Record<string, unknown>} [options.overrides] - explicit stub values, keyed by export name
 * @param {(name: string) => unknown} [options.defaultStub] - stub factory for exports with no
 *   override; defaults to `() => jestObj.fn()`
 * @returns {Record<string, unknown>} the stub object passed to `jest.unstable_mockModule`
 */
function mockBarrel(jestObj, specifier, { from, overrides = {}, defaultStub } = {}) {
    if (!jestObj || typeof jestObj.unstable_mockModule !== 'function') {
        throw new Error('esmBarrelMock.mockBarrel: `jestObj` must be the `jest` object from @jest/globals.');
    }
    if (!from) {
        throw new Error('esmBarrelMock.mockBarrel: `from` (the calling test file\'s import.meta.url) is required.');
    }

    const absolutePath = resolveFromSpecifier(specifier, from);
    const names = listBarrelExports(absolutePath);
    const nameSet = new Set(names);

    for (const overriddenName of Object.keys(overrides)) {
        if (!nameSet.has(overriddenName)) {
            throw new Error(
                `esmBarrelMock.mockBarrel: override "${overriddenName}" is not an export of `
                + `${specifier} (resolved: ${absolutePath}). Known exports: ${names.join(', ')}`
            );
        }
    }

    const makeDefault = typeof defaultStub === 'function' ? defaultStub : () => jestObj.fn();

    const stubs = {};
    for (const name of names) {
        stubs[name] = Object.prototype.hasOwnProperty.call(overrides, name)
            ? overrides[name]
            : makeDefault(name);
    }

    jestObj.unstable_mockModule(specifier, () => stubs);
    return stubs;
}

export { listNamedExports, listDefaultExportKeys, mockBarrel };

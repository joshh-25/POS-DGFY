import { readFileSync } from 'node:fs';
import { describe, expect, it, jest } from '@jest/globals';
import { listNamedExports, listDefaultExportKeys, mockBarrel } from './helpers/esmBarrelMock.js';

const POS_INDEX_PATH = new URL('../src/modules/pos/index.js', import.meta.url);
const POS_HANDLERS_PATH = new URL('../src/modules/pos/controllers/posHandlers.js', import.meta.url);
const POS_CONTROLLER_PATH = new URL('../src/controllers/posController.js', import.meta.url);

/**
 * Every name posHandlers.js destructures out of `../index.js` -- extracted the same static way
 * the file itself would be read, from the `import { ... } from '../index.js';` block, so this
 * assertion is exercising the exact contract that rotted twice during #1432 (Phase 249): every
 * name a consumer imports from the barrel is actually one of the barrel's own exports.
 */
function listPosHandlersBarrelImportNames() {
    const source = readFileSync(POS_HANDLERS_PATH, 'utf8');
    const match = /import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/index\.js['"]/.exec(source);
    if (!match) {
        throw new Error('esmBarrelMock.helper.test: could not find the `../index.js` import block in posHandlers.js.');
    }
    return match[1]
        .split(',')
        .map((raw) => raw.trim())
        .filter(Boolean)
        .map((specifier) => {
            // `import { a as b }` binds the local name after `as`; a plain `import { a }` binds `a`.
            const asMatch = specifier.match(/\bas\s+([A-Za-z_$][\w$]*)\s*$/);
            return asMatch ? asMatch[1] : specifier.split(/\s+/)[0];
        });
}

describe('esmBarrelMock helper self-test', () => {
    describe('listNamedExports', () => {
        it('includes the 3 #1432 Phase 249 additions to the POS barrel', () => {
            const source = readFileSync(POS_INDEX_PATH, 'utf8');
            const names = listNamedExports(source);

            // These were the exports that #1432 added and the hand-enumerated mocks failed to
            // pick up in time -- keeping them named explicitly here means a future accidental
            // revert of any of the three fails this test loudly instead of silently.
            expect(names).toEqual(expect.arrayContaining([
                'openTerminalShiftUseCase',
                'switchTerminalShiftLocationUseCase',
                'closeTerminalShiftUseCase'
            ]));
        });

        it('every name posHandlers.js destructures from ../index.js is a subset of the parsed barrel names', () => {
            const barrelSource = readFileSync(POS_INDEX_PATH, 'utf8');
            const barrelNames = new Set(listNamedExports(barrelSource));
            const importedNames = listPosHandlersBarrelImportNames();

            expect(importedNames.length).toBeGreaterThan(100);
            const missing = importedNames.filter((name) => !barrelNames.has(name));
            expect(missing).toEqual([]);
        });

        it('throws on `export *` input', () => {
            const source = "export * from './somewhere.js';\nexport const a = 1;\n";
            expect(() => listNamedExports(source)).toThrow(/export \*/);
        });

        it('throws on `export default` input', () => {
            const source = 'export default { a: 1 };\n';
            expect(() => listNamedExports(source)).toThrow(/export default/);
        });

        it('resolves `export { a, b as c }` and inline declarations together', () => {
            const source = `
                export { alpha, beta as renamedBeta };
                export const gamma = () => {};
                export function delta() {}
                export class Epsilon {}
            `;
            expect(listNamedExports(source)).toEqual(['alpha', 'renamedBeta', 'gamma', 'delta', 'Epsilon']);
        });
    });

    describe('listDefaultExportKeys', () => {
        it('parses posController.js\'s export default object', () => {
            const source = readFileSync(POS_CONTROLLER_PATH, 'utf8');
            const keys = listDefaultExportKeys(source);

            expect(keys.length).toBeGreaterThan(100);
            expect(keys).toEqual(expect.arrayContaining(['checkout', 'voidTransaction', 'getReportsOverview']));
            // The `export default {` line itself, not a nested value, is what's being parsed.
            const defaultExportLineIndex = source.split('\n').findIndex((line) => line === 'export default {');
            expect(defaultExportLineIndex).toBeGreaterThan(-1);
        });

        it('ignores nested object/array values and does not surface their keys', () => {
            const source = `
                export default {
                    a,
                    b: { nested: 1, alsoNested: 2 },
                    c: [1, 2, 3],
                    d
                };
            `;
            expect(listDefaultExportKeys(source)).toEqual(['a', 'b', 'c', 'd']);
        });

        it('throws when there is no export default object literal', () => {
            const source = 'export const a = 1;\n';
            expect(() => listDefaultExportKeys(source)).toThrow(/no `export default/);
        });

        it('throws on a spread element it cannot resolve statically', () => {
            const source = 'export default { a, ...rest };\n';
            expect(() => listDefaultExportKeys(source)).toThrow(/spread/);
        });
    });

    describe('mockBarrel', () => {
        it('derives a working jest.unstable_mockModule stub set from a real barrel, applying overrides', () => {
            const fakeJest = { unstable_mockModule: jest.fn(), fn: () => jest.fn() };
            // mockBarrel resolves `specifier` against `from` and reads the real filesystem, so
            // exercise it against the real POS barrel -- `from` is this test file, `specifier`
            // is exactly what a caller would pass to `jest.unstable_mockModule`.
            const stubs = mockBarrel(fakeJest, '../src/modules/pos/index.js', {
                from: import.meta.url,
                overrides: { checkoutPosUseCase: 'OVERRIDDEN' }
            });

            expect(stubs.checkoutPosUseCase).toBe('OVERRIDDEN');
            expect(typeof stubs.scanPosBarcodeUseCase).toBe('function');
            expect(fakeJest.unstable_mockModule).toHaveBeenCalledWith(
                '../src/modules/pos/index.js',
                expect.any(Function)
            );
        });

        it('throws if an override name is not an actual export (catches reverse rot)', () => {
            const fakeJest = { unstable_mockModule: jest.fn(), fn: () => jest.fn() };
            expect(() => mockBarrel(fakeJest, '../src/modules/pos/index.js', {
                from: import.meta.url,
                overrides: { thisExportDoesNotExist: jest.fn() }
            })).toThrow(/is not an export of/);
        });

        it('uses listDefaultExportKeys for a module whose source has an export default object', () => {
            const fakeJest = { unstable_mockModule: jest.fn(), fn: () => jest.fn() };
            const stubs = mockBarrel(fakeJest, '../src/controllers/posController.js', {
                from: import.meta.url,
                overrides: { checkout: 'CHECKOUT_STUB' }
            });

            expect(stubs.checkout).toBe('CHECKOUT_STUB');
            expect(typeof stubs.voidTransaction).toBe('function');
        });
    });
});

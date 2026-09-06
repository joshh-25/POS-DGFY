import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Static guard against the trap documented in encodeVariants.js's own header comment: the
 * global `structuredClone()` shim in `src/compat/chrome80Runtime.js` has no Blob/File/
 * ArrayBuffer/ImageBitmap support and silently produces an empty object for them on Chrome
 * 80-84 instead of throwing. Nothing in this module should ever call it -- File/Blob objects
 * cross the worker boundary via the browser's own native structured-clone support in
 * `postMessage`, not this polyfilled global. A runtime test can't easily distinguish "never
 * called" from "called but happened not to receive binary data this run," so this is a literal
 * source scan instead, per the corrected implementation plan's own guidance for this case.
 */

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const imageEncodingDir = path.resolve(moduleDir, '..');

function collectSourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return [];
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

// Several of this module's own doc comments name `structuredClone()` by way of explaining why
// it's never called (see encodeVariants.js's header) -- strip comments before scanning so the
// guard checks actual calls, not its own documentation of the trap it guards against.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('structuredClone-on-binary-data guard', () => {
  it('never calls the global structuredClone() anywhere in imageEncoding/', () => {
    const sourceFiles = collectSourceFiles(imageEncodingDir);
    expect(sourceFiles.length).toBeGreaterThan(0);

    const offenders = sourceFiles.filter((filePath) =>
      stripComments(readFileSync(filePath, 'utf8')).includes('structuredClone(')
    );

    expect(offenders).toEqual([]);
  });
});

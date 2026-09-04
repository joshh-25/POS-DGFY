import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveAppVersion, buildStampPlugin } from '../buildStampPlugin.js';

describe('resolveAppVersion (ADR 0081 Decision 4, #1548 Wave 3 Phase 278)', () => {
    const tempDirs = [];

    afterEach(() => {
        while (tempDirs.length) {
            fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
        }
    });

    const makeAppDir = (packageJson) => {
        const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-core-app-version-'));
        tempDirs.push(appDir);
        if (packageJson !== undefined) {
            fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson));
        }
        return appDir;
    };

    it('prefers APP_VERSION over the package.json fallback', () => {
        const appDir = makeAppDir({ version: '1.1.0' });
        expect(resolveAppVersion(appDir, { APP_VERSION: '1.5.2-staging' })).toBe('1.5.2-staging');
    });

    it('falls back to the app\'s own package.json version when APP_VERSION is unset', () => {
        const appDir = makeAppDir({ version: '1.1.0' });
        expect(resolveAppVersion(appDir, {})).toBe('1.1.0');
    });

    it('treats a blank APP_VERSION the same as unset', () => {
        const appDir = makeAppDir({ version: '1.1.0' });
        expect(resolveAppVersion(appDir, { APP_VERSION: '   ' })).toBe('1.1.0');
    });

    it('returns the unknown sentinel when neither source is available', () => {
        const appDir = makeAppDir(undefined);
        expect(resolveAppVersion(appDir, {})).toBe('unknown');
    });
});

describe('buildStampPlugin', () => {
    it('injects the dgfy-version meta tag and emits version.json for the resolved version', () => {
        const plugin = buildStampPlugin('1.5.2-staging');
        expect(plugin.name).toBe('dgfy-build-stamp');
        expect(plugin.apply).toBe('build');
        expect(plugin.transformIndexHtml()).toEqual([
            {
                tag: 'meta',
                attrs: { name: 'dgfy-version', content: '1.5.2-staging' },
                injectTo: 'head'
            }
        ]);

        const emitted = [];
        plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) });
        expect(emitted).toEqual([
            {
                type: 'asset',
                fileName: 'version.json',
                source: JSON.stringify({ version: '1.5.2-staging' })
            }
        ]);
    });
});

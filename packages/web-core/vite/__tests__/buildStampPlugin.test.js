import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveAppVersion, resolveReleaseFloor, buildStampPlugin } from '../buildStampPlugin.js';

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

describe('resolveReleaseFloor (#1977 Phase 341)', () => {
    const tempDirs = [];

    afterEach(() => {
        while (tempDirs.length) {
            fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
        }
    });

    const makeAppDir = (packageJson) => {
        const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-core-release-floor-'));
        tempDirs.push(appDir);
        if (packageJson !== undefined) {
            fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson));
        }
        return appDir;
    };

    it('prefers APP_RELEASE_FLOOR/APP_RELEASE_REVISION over every fallback', () => {
        const appDir = makeAppDir({ version: '1.13.0' });
        expect(resolveReleaseFloor(appDir, { APP_RELEASE_FLOOR: '1.13.0', APP_RELEASE_REVISION: 'r16' })).toEqual({
            floor: '1.13.0',
            revision: 'r16'
        });
    });

    it('falls back to the app package.json floor with a null revision on ordinary DEV builds', () => {
        const appDir = makeAppDir({ version: '1.13.0' });
        expect(resolveReleaseFloor(appDir, {})).toEqual({ floor: '1.13.0', revision: null });
    });

    it('accepts the VITE_APP_RELEASE_* builder-stage spellings', () => {
        const appDir = makeAppDir({ version: '1.13.0' });
        expect(
            resolveReleaseFloor(appDir, { VITE_APP_RELEASE_FLOOR: '1.13.0', VITE_APP_RELEASE_REVISION: 'r16' })
        ).toEqual({ floor: '1.13.0', revision: 'r16' });
    });
});

describe('buildStampPlugin release metadata (#1977 Phase 341)', () => {
    it('emits the legacy shape unchanged when called with a bare version string', () => {
        const plugin = buildStampPlugin('1.5.2-staging');
        expect(plugin.transformIndexHtml()).toEqual([
            { tag: 'meta', attrs: { name: 'dgfy-version', content: '1.5.2-staging' }, injectTo: 'head' }
        ]);
        const emitted = [];
        plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) });
        expect(emitted).toEqual([
            { type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: '1.5.2-staging' }) }
        ]);
    });

    it('stamps floor/revision meta tags and version.json fields when release info is supplied', () => {
        const plugin = buildStampPlugin('1.13.0-r16', { floor: '1.13.0', revision: 'r16' });
        expect(plugin.transformIndexHtml()).toEqual([
            { tag: 'meta', attrs: { name: 'dgfy-version', content: '1.13.0-r16' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'dgfy-release-floor', content: '1.13.0' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'dgfy-release-revision', content: 'r16' }, injectTo: 'head' }
        ]);
        const emitted = [];
        plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) });
        expect(emitted).toEqual([
            {
                type: 'asset',
                fileName: 'version.json',
                source: JSON.stringify({ version: '1.13.0-r16', release_floor: '1.13.0', release_revision: 'r16' })
            }
        ]);
    });

    it('omits the revision meta tag (but keeps the floor) when no revision is known', () => {
        const plugin = buildStampPlugin('1.13.0-dev', { floor: '1.13.0', revision: null });
        expect(plugin.transformIndexHtml()).toEqual([
            { tag: 'meta', attrs: { name: 'dgfy-version', content: '1.13.0-dev' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'dgfy-release-floor', content: '1.13.0' }, injectTo: 'head' }
        ]);
    });
});

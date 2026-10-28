import { describe, expect, it } from 'vitest';
import esCompatGuardPlugin, { createMapLibreWorkerBootstrapBanner } from '../esCompatGuardPlugin.js';

const shimDependentCalls = [
    ['String.prototype.replaceAll', '.replaceAll(', 'value.replaceAll("a", "b")'],
    ['Array.prototype.at', '.at(', 'value.at(-1)'],
    ['Object.hasOwn', 'Object.hasOwn(', 'Object.hasOwn(value, "key")'],
    ['Array.prototype.findLast', '.findLast(', 'value.findLast(Boolean)'],
    ['Array.prototype.findLastIndex', '.findLastIndex(', 'value.findLastIndex(Boolean)'],
    ['structuredClone', 'structuredClone(', 'structuredClone(value)'],
    ['Array.prototype.toSorted', '.toSorted(', 'value.toSorted()']
];

const makeWorkerChunk = (code, name = 'maplibre-gl-worker') => ({
    type: 'chunk',
    fileName: `${name}.js`,
    name,
    facadeModuleId: name === 'maplibre-gl-worker'
        ? '/repo/apps/dgfy-pos/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'
        : `/repo/packages/web-core/src/${name}.js`,
    modules: {},
    code
});

const runPlugin = (plugin, bundle) => {
    plugin.generateBundle.call({
        error(message) {
            throw new Error(message);
        }
    }, {}, bundle);
};

describe('esCompatGuardPlugin worker compatibility checks', () => {
    it.each(shimDependentCalls)('rejects %s in an unbootstrapped worker', (_name, token, call) => {
        const bundle = { 'maplibre-gl-worker.js': makeWorkerChunk(`const result = ${call};`) };

        expect(() => runPlugin(esCompatGuardPlugin({ inspectWorkerOutputs: true }), bundle))
            .toThrow(`maplibre-gl-worker.js: "${token}"`);
    });

    it('bootstraps the MapLibre entry before its code and allows the shimmed methods', () => {
        const mapLibreChunk = makeWorkerChunk(
            'const result = value.replaceAll("a", "b"); Object.hasOwn(value, "key"); value.at(-1);'
        );
        const otherWorkerChunk = makeWorkerChunk('self.onmessage = () => {};', 'encodeWorker');
        const banner = createMapLibreWorkerBootstrapBanner();
        mapLibreChunk.code = `${banner(mapLibreChunk)}${mapLibreChunk.code}`;
        otherWorkerChunk.code = `${banner(otherWorkerChunk)}${otherWorkerChunk.code}`;
        const bundle = {
            [mapLibreChunk.fileName]: mapLibreChunk,
            [otherWorkerChunk.fileName]: otherWorkerChunk
        };

        runPlugin(esCompatGuardPlugin({ inspectWorkerOutputs: true }), bundle);

        expect(mapLibreChunk.code.startsWith('(() => { globalThis.__DGFY_CHROME80_WORKER_BOOTSTRAP_V1__'))
            .toBe(true);
        expect(mapLibreChunk.code.indexOf('String.prototype.replaceAll !=='))
            .toBeLessThan(mapLibreChunk.code.indexOf('value.replaceAll'));
        expect(otherWorkerChunk.code.startsWith('(() => { globalThis.__DGFY_CHROME80_WORKER_BOOTSTRAP_V1__'))
            .toBe(false);
    });

    it('rejects existing denylisted methods even when the worker has the bootstrap', () => {
        const bundle = {
            'maplibre-gl-worker.js': makeWorkerChunk(
                'const result = value.replaceAll("a", "b"); Promise.withResolvers();'
            )
        };

        expect(() => runPlugin(
            esCompatGuardPlugin({ inspectWorkerOutputs: true }),
            bundle
        )).toThrow('"Promise.withResolvers("');
    });

    it('requires semantics review before a bootstrapped worker can use structuredClone', () => {
        const chunk = makeWorkerChunk('structuredClone(new ArrayBuffer(8));');
        const banner = createMapLibreWorkerBootstrapBanner();
        chunk.code = `${banner(chunk)}${chunk.code}`;

        expect(() => runPlugin(
            esCompatGuardPlugin({ inspectWorkerOutputs: true }),
            { [chunk.fileName]: chunk }
        )).toThrow('the existing structuredClone fallback is partial');
    });

    it('scans emitted worker JavaScript assets for shim-dependent methods', () => {
        const bundle = {
            'assets/maplibre-gl-worker-abc123.js': {
                type: 'asset',
                fileName: 'assets/maplibre-gl-worker-abc123.js',
                source: 'const result = value.replaceAll("a", "b");'
            }
        };

        expect(() => runPlugin(esCompatGuardPlugin({ inspectWorkerOutputs: true }), bundle))
            .toThrow('assets/maplibre-gl-worker-abc123.js: ".replaceAll("');
    });

    it('rejects a worker with an unknown shim hash or a bootstrap placed after worker code', () => {
        const assetName = 'assets/maplibre-gl-worker-abc123.js';
        const banner = createMapLibreWorkerBootstrapBanner();
        const chunk = makeWorkerChunk('value.replaceAll("a", "b");');
        const lateBanner = banner(chunk);

        for (const source of [
            `globalThis.__DGFY_CHROME80_WORKER_BOOTSTRAP_V1__ = 'sha256:wrong'; value.replaceAll("a", "b");`,
            `value.replaceAll("a", "b");${lateBanner}`
        ]) {
            const bundle = {
                [assetName]: { type: 'asset', fileName: assetName, source }
            };
            expect(() => runPlugin(esCompatGuardPlugin({ inspectWorkerOutputs: true }), bundle))
                .toThrow(`${assetName}: ".replaceAll("`);
        }
    });

    it('continues to reject the existing denylist in emitted worker assets', () => {
        const assetName = 'assets/maplibre-gl-worker-abc123.js';
        const bundle = {
            [assetName]: {
                type: 'asset',
                fileName: assetName,
                source: 'Promise.withResolvers();'
            }
        };

        expect(() => runPlugin(esCompatGuardPlugin({ inspectWorkerOutputs: true }), bundle))
            .toThrow('"Promise.withResolvers("');
    });

    it('accepts the bootstrapped worker after it is emitted as an asset', () => {
        const chunk = makeWorkerChunk('const result = value.replaceAll("a", "b");');
        const workerBundle = { [chunk.fileName]: chunk };
        const banner = createMapLibreWorkerBootstrapBanner();
        chunk.code = `${banner(chunk)}${chunk.code}`;
        runPlugin(esCompatGuardPlugin({ inspectWorkerOutputs: true }), workerBundle);

        const assetName = 'assets/maplibre-gl-worker-abc123.js';
        runPlugin(esCompatGuardPlugin({ inspectWorkerOutputs: true }), {
            [assetName]: { type: 'asset', fileName: assetName, source: chunk.code }
        });
    });

    it('does not apply worker-only shim checks to unrelated main-thread assets', () => {
        const bundle = {
            'assets/runtime.js': {
                type: 'asset',
                fileName: 'assets/runtime.js',
                source: 'value.replaceAll("a", "b");'
            },
            'assets/WorkerSettings-abc123.js': {
                type: 'chunk',
                fileName: 'assets/WorkerSettings-abc123.js',
                code: 'value.replaceAll("a", "b");'
            }
        };

        expect(() => runPlugin(esCompatGuardPlugin({ inspectWorkerOutputs: true }), bundle)).not.toThrow();
    });

    it('keeps the existing main-thread policy unchanged while preserving the denylist', () => {
        const plugin = esCompatGuardPlugin();
        const bundle = {
            'assets/main.js': {
                type: 'chunk',
                fileName: 'assets/main.js',
                code: 'value.replaceAll("a", "b"); value.at(-1); Object.hasOwn(value, "key");'
            }
        };

        expect(() => runPlugin(plugin, bundle)).not.toThrow();
        bundle['assets/main.js'].code = 'Promise.withResolvers();';
        expect(() => runPlugin(plugin, bundle)).toThrow('"Promise.withResolvers("');
    });
});

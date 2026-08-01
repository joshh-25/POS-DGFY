/**
 * Menu PDF Raster Service
 *
 * Renders a scanned/image-only PDF's pages to PNG buffers so they can be fed
 * through the existing vision extraction path (extractMenuItemsFromImage in
 * menuExtractionService.js) — the fallback for PDFs where pdf-parse's text
 * extraction comes back empty. Pure/self-contained: no Redis, no OpenAI, just
 * PDF bytes in, PNG buffers out.
 *
 * Built on pdfjs-dist + @napi-rs/canvas, both already resolved in
 * node_modules as pdf-parse's own dependencies — this module is the first to
 * use them directly. Verified working end-to-end (including inside a real
 * node:22-alpine container, matching the production runtime's musl libc) as
 * part of Phase 3 planning; see docs/proposals/
 * MENU_IMPORT_BATCH_IMPORT_HANDOFF_2026-07-28.md for why this needed a spike
 * before building on it (no poppler-utils/pdftoppm fallback needed).
 *
 * --- Why @napi-rs/canvas is loaded lazily, behind a subprocess probe ------
 *
 * @napi-rs/canvas is a native addon, and its prebuilt Skia binary is compiled
 * for an x86-64 ISA level above this project's floor (it uses AVX-family
 * instructions). On a host whose CPU lacks them — e.g. a KVM guest left on
 * the default `qemu64` CPU model, which is exactly what the dev VM runs —
 * merely dlopen'ing it raises SIGILL and kills the process on the spot.
 *
 * That used to happen at *import* time, and because server.js reaches this
 * module through workers/menuImportWorker.js → menuExtractionService.js, it
 * took the entire API down at boot with exit 132 in an unbroken restart loop
 * — even though menu import is env-gated OFF by default. So:
 *
 *   1. the addon is imported lazily, on first render, not at module load; and
 *   2. before it is ever loaded in-process, a one-shot child process attempts
 *      the import on our behalf. SIGILL is a signal, not a catchable JS
 *      exception — a try/catch around import() would NOT save the process —
 *      so the only safe way to ask "can this addon load here?" is to let a
 *      throwaway child find out and read its exit status.
 *
 * The answer is cached for the process lifetime. When it is "no",
 * rasterization degrades to MenuRasterUnsupportedError, which
 * menuExtractionService.js maps onto a normal per-file extraction failure.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BACKEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Thrown when PDF rasterization cannot run on this host at all — as opposed
 * to a particular PDF failing to render. Deliberately declared here rather
 * than reusing menuExtractionService.js's MenuExtractionError: this module is
 * the leaf of that import chain and must not import back into it.
 */
export class MenuRasterUnsupportedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MenuRasterUnsupportedError';
        this.code = 'PDF_RASTER_UNSUPPORTED';
    }
}

const RASTER_UNSUPPORTED_MESSAGE = 'PDF rasterization is unavailable on this server: '
    + '@napi-rs/canvas could not be loaded (the CPU is missing an instruction set that its '
    + 'prebuilt Skia binary requires).';

// Operational kill switch, read at call time rather than captured at import —
// same convention as isMenuImportLegacySingleFileEnabled() in
// config/menuImportFeature.js. Lets an operator disable rasterization (and
// skip the probe entirely) without a rebuild.
const isRasterizationEnabled = () => process.env.MENU_IMPORT_PDF_RASTER_ENABLED !== 'false';

let _canvasSupported = null;

/**
 * Asks a throwaway child process whether @napi-rs/canvas can be loaded here,
 * so a SIGILL from its native binary lands in the child instead of killing
 * this process. Memoized — the probe spawns at most once per process, on the
 * first rasterization attempt (never at boot).
 * @returns {boolean}
 */
export const isPdfRasterizationSupported = () => {
    if (!isRasterizationEnabled()) return false;
    if (_canvasSupported !== null) return _canvasSupported;

    const probe = spawnSync(
        process.execPath,
        ['-e', 'import("@napi-rs/canvas").then(() => process.exit(0), () => process.exit(1))'],
        // cwd matters: `node -e` resolves bare specifiers against the working
        // directory, which is not guaranteed to be the backend root.
        { cwd: BACKEND_ROOT, timeout: 15000, stdio: 'ignore' }
    );

    // A SIGILL surfaces as probe.signal with a null status; a spawn failure or
    // timeout surfaces as probe.error. Anything short of a clean exit 0 means
    // "do not load this in-process".
    _canvasSupported = !probe.error && probe.status === 0;
    return _canvasSupported;
};

let _canvasLib = null;
const getCanvasLib = async () => {
    if (!isPdfRasterizationSupported()) {
        throw new MenuRasterUnsupportedError(RASTER_UNSUPPORTED_MESSAGE);
    }
    if (!_canvasLib) {
        _canvasLib = await import('@napi-rs/canvas');
        // pdfjs-dist's legacy Node build expects a DOMMatrix global when
        // rendering outside a browser; @napi-rs/canvas ships a compatible
        // implementation. Installed here rather than at module load, so it
        // still lands before the first page.render() call.
        if (!globalThis.DOMMatrix) {
            globalThis.DOMMatrix = _canvasLib.DOMMatrix;
        }
    }
    return _canvasLib;
};

let _pdfjsLib = null;
const getPdfjsLib = async () => {
    if (!_pdfjsLib) {
        _pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
    return _pdfjsLib;
};

// Deliberately not wiring standardFontDataUrl: pdf.js's Node-side font
// fetcher uses the global fetch(), which can't read file:// URLs (throws
// "not implemented... file"), so a local path/URL just trades pdf.js's own
// harmless "no standardFontDataUrl provided" warning for a fetch failure
// with no functional difference in rendering — confirmed visually against a
// real render. This mainly affects glyph substitution for non-embedded
// fonts, which barely applies to this feature's actual target (scanned
// PDFs have no embedded font/text layer to substitute in the first place).
const TARGET_LONG_EDGE_PX = 1600;
const MAX_RENDER_SCALE = 2.0;

const renderPageToPngBuffer = async (page) => {
    const { createCanvas } = await getCanvasLib();
    const baseViewport = page.getViewport({ scale: 1.0 });
    const longEdge = Math.max(baseViewport.width, baseViewport.height);
    const scale = Math.min(MAX_RENDER_SCALE, TARGET_LONG_EDGE_PX / longEdge);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const canvasContext = canvas.getContext('2d');

    await page.render({ canvasContext, viewport }).promise;

    return canvas.toBuffer('image/png');
};

/**
 * Renders up to `maxPages` pages of a PDF to PNG buffers, with bounded
 * concurrency (reusing MENU_IMPORT_WORKER_CONCURRENCY-style pacing keeps
 * this fast for the synchronous single-file endpoint, which has no async job
 * to hide render latency behind).
 * @param {Buffer} pdfBuffer
 * @param {Object} [options]
 * @param {number} [options.maxPages=15]
 * @param {number} [options.concurrency=2]
 * @returns {Promise<{buffers: Buffer[], pagesTotal: number, truncated: boolean}>}
 * @throws {MenuRasterUnsupportedError} when this host cannot load the canvas addon
 */
export const rasterizePdfPages = async (pdfBuffer, { maxPages = 15, concurrency = 2 } = {}) => {
    // Resolve the canvas addon (and install the DOMMatrix global) before pdf.js
    // touches the document: it fails fast on hosts that cannot rasterize at all,
    // rather than after parsing an entire PDF only to die on the first page.
    await getCanvasLib();

    const pdfjsLib = await getPdfjsLib();
    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        disableFontFace: true
    });

    const doc = await loadingTask.promise;
    try {
        const pagesTotal = doc.numPages;
        const pageNumbersToRender = Array.from(
            { length: Math.min(pagesTotal, maxPages) },
            (_, index) => index + 1
        );

        const buffers = new Array(pageNumbersToRender.length);
        let nextIndex = 0;
        const runWorker = async () => {
            while (nextIndex < pageNumbersToRender.length) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                const page = await doc.getPage(pageNumbersToRender[currentIndex]);
                try {
                    buffers[currentIndex] = await renderPageToPngBuffer(page);
                } finally {
                    page.cleanup();
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, pageNumbersToRender.length) }, runWorker));

        return {
            buffers,
            pagesTotal,
            truncated: pagesTotal > maxPages
        };
    } finally {
        await doc.destroy();
    }
};

export default { rasterizePdfPages, isPdfRasterizationSupported, MenuRasterUnsupportedError };

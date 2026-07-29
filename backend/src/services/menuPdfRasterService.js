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
 * import them directly. Verified working end-to-end (including inside a real
 * node:22-alpine container, matching the production runtime's musl libc) as
 * part of Phase 3 planning; see docs/proposals/
 * MENU_IMPORT_BATCH_IMPORT_HANDOFF_2026-07-28.md for why this needed a spike
 * before building on it (no poppler-utils/pdftoppm fallback needed).
 */

import { createCanvas, DOMMatrix } from '@napi-rs/canvas';

// pdfjs-dist's legacy Node build expects a DOMMatrix global when rendering
// outside a browser; @napi-rs/canvas ships a compatible implementation.
if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = DOMMatrix;
}

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
 */
export const rasterizePdfPages = async (pdfBuffer, { maxPages = 15, concurrency = 2 } = {}) => {
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

export default { rasterizePdfPages };

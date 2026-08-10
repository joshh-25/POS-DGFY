import {
    rasterizePdfPages,
    isPdfRasterizationSupported,
    MenuRasterUnsupportedError
} from '../src/services/menuPdfRasterService.js';

// Minimal hand-built PDFs (no external fixture files) — same construction
// used to spike-verify pdfjs-dist + @napi-rs/canvas actually renders (see
// docs/proposals/MENU_IMPORT_BATCH_IMPORT_HANDOFF_2026-07-28.md for why that
// spike mattered before building Phase 3 on this combination).
const singlePagePdf = () => Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 40 >>
stream
BT /F1 24 Tf 20 100 Td (Single Page) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
trailer
<< /Size 6 /Root 1 0 R >>
%%EOF`);

const multiPagePdf = (pageCount) => {
    const pageObjNums = Array.from({ length: pageCount }, (_, i) => 3 + i * 2);
    const contentObjNums = Array.from({ length: pageCount }, (_, i) => 4 + i * 2);
    const fontObjNum = 3 + pageCount * 2;

    const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj\n`;
    const pageObjs = pageObjNums.map((n, i) => (
        `${n} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNums[i]} 0 R >>\nendobj\n`
    )).join('');
    const contentObjs = contentObjNums.map((n, i) => (
        `${n} 0 obj\n<< /Length 40 >>\nstream\nBT /F1 24 Tf 20 100 Td (Page ${i + 1}) Tj ET\nendstream\nendobj\n`
    )).join('');
    const fontObj = `${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

    return Buffer.from(
        '%PDF-1.4\n'
        + '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
        + pagesObj
        + pageObjs
        + contentObjs
        + fontObj
        + `xref\n0 ${fontObjNum + 1}\n0000000000 65535 f \n`
        + `trailer\n<< /Size ${fontObjNum + 1} /Root 1 0 R >>\n%%EOF`
    );
};

describe('menuPdfRasterService.rasterizePdfPages', () => {
    it('renders every page of a document that fits under maxPages', async () => {
        const result = await rasterizePdfPages(multiPagePdf(3), { maxPages: 15 });

        expect(result.pagesTotal).toBe(3);
        expect(result.truncated).toBe(false);
        expect(result.buffers).toHaveLength(3);
        for (const buffer of result.buffers) {
            expect(Buffer.isBuffer(buffer)).toBe(true);
            expect(buffer.length).toBeGreaterThan(0);
        }
    });

    it('caps rendering at maxPages and flags truncated when the document has more pages', async () => {
        const result = await rasterizePdfPages(multiPagePdf(5), { maxPages: 2 });

        expect(result.pagesTotal).toBe(5);
        expect(result.truncated).toBe(true);
        expect(result.buffers).toHaveLength(2);
    });

    it('does not flag truncated when the document has exactly maxPages', async () => {
        const result = await rasterizePdfPages(multiPagePdf(2), { maxPages: 2 });

        expect(result.pagesTotal).toBe(2);
        expect(result.truncated).toBe(false);
        expect(result.buffers).toHaveLength(2);
    });

    it('renders a single-page document', async () => {
        const result = await rasterizePdfPages(singlePagePdf(), { maxPages: 15 });

        expect(result.pagesTotal).toBe(1);
        expect(result.truncated).toBe(false);
        expect(result.buffers).toHaveLength(1);
    });

    it('rejects a corrupt/non-PDF buffer instead of hanging', async () => {
        await expect(rasterizePdfPages(Buffer.from('not a pdf at all'), { maxPages: 15 }))
            .rejects.toThrow();
    });

    it('respects a bounded concurrency setting without changing the result', async () => {
        const result = await rasterizePdfPages(multiPagePdf(4), { maxPages: 15, concurrency: 1 });

        expect(result.buffers).toHaveLength(4);
        expect(result.truncated).toBe(false);
    });
});

// The @napi-rs/canvas addon SIGILLs on CPUs below its prebuilt Skia binary's
// ISA level (see the module header). A SIGILL is a signal, not a catchable
// exception, so the addon is probed out-of-process and only ever imported once
// that probe says it is safe. These cover the "cannot rasterize here" branch —
// the one that used to be an exit-132 crash loop instead of an error.
describe('menuPdfRasterService capability gating', () => {
    const originalFlag = process.env.MENU_IMPORT_PDF_RASTER_ENABLED;

    afterEach(() => {
        if (originalFlag === undefined) {
            delete process.env.MENU_IMPORT_PDF_RASTER_ENABLED;
        } else {
            process.env.MENU_IMPORT_PDF_RASTER_ENABLED = originalFlag;
        }
    });

    it('reports rasterization as supported on a host whose CPU can load the addon', () => {
        // Guards the probe itself: if this ever fails while the render tests
        // above pass, the probe has become wrong rather than the host.
        expect(isPdfRasterizationSupported()).toBe(true);
    });

    it('degrades to MenuRasterUnsupportedError instead of crashing when unsupported', async () => {
        process.env.MENU_IMPORT_PDF_RASTER_ENABLED = 'false';

        await expect(rasterizePdfPages(singlePagePdf(), { maxPages: 15 }))
            .rejects.toThrow(MenuRasterUnsupportedError);
    });

    it('tags the unsupported error with the PDF_RASTER_UNSUPPORTED code', async () => {
        process.env.MENU_IMPORT_PDF_RASTER_ENABLED = 'false';

        await expect(rasterizePdfPages(singlePagePdf(), { maxPages: 15 }))
            .rejects.toMatchObject({ code: 'PDF_RASTER_UNSUPPORTED' });
    });

    it('reads the kill switch at call time, so flipping it back restores rendering', async () => {
        process.env.MENU_IMPORT_PDF_RASTER_ENABLED = 'false';
        expect(isPdfRasterizationSupported()).toBe(false);

        process.env.MENU_IMPORT_PDF_RASTER_ENABLED = 'true';
        expect(isPdfRasterizationSupported()).toBe(true);

        const result = await rasterizePdfPages(singlePagePdf(), { maxPages: 15 });
        expect(result.buffers).toHaveLength(1);
    });
});

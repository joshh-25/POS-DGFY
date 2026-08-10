import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dockerfilePath = path.resolve(__dirname, '../../../infrastructure/docker/dgfy-api/Dockerfile');

// itemImageGenerationService.js's watermark compositing and
// platformInvoicePdf.js's Sieitz logo both load a file under
// apps/dgfy-api/assets/ via a fileURLToPath(new URL('...', import.meta.url))
// path -- resolved against the *running* code's location, not the git
// checkout. Their own tests run against the real committed asset on disk and
// pass regardless of whether the Docker image actually ships it, so they
// can't catch a missing `COPY apps/dgfy-api/assets` -- only this Dockerfile
// check can. This is exactly the gap that shipped with #176 and silently
// broke image generation until #212's status reporting finally surfaced it
// as "watermark ... missing".
describe('dgfy-api Dockerfile', () => {
    it('copies apps/dgfy-api/assets into the image so runtime asset lookups resolve', async () => {
        const dockerfile = await fs.readFile(dockerfilePath, 'utf8');
        expect(dockerfile).toMatch(/^COPY apps\/dgfy-api\/assets \.\/assets$/m);
    });
});

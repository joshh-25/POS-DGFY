import crypto from 'crypto';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ZipArchive } from 'archiver';
import { createPosBulkImageImportStorage } from '../src/modules/pos/repositories/posBulkImageImportStorage.js';

const createZip = async (target, entries) => new Promise((resolve, reject) => {
    const output = createWriteStream(target);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
    archive.pipe(output);
    entries.forEach(({ name, bytes }) => archive.append(bytes, { name }));
    archive.finalize().catch(reject);
});

describe('POS bulk image import private storage', () => {
    let root;
    let storage;
    let jobId;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-image-import-'));
        storage = createPosBulkImageImportStorage({ root });
        jobId = crypto.randomUUID();
        await storage.create({
            jobId,
            manifestCsv: 'sku_code,image_filename,replace_existing\nSKU-1,one.jpg,true\n'
        });
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    test('assembles chunks and extracts only the expected flat files', async () => {
        const zipPath = path.join(root, 'source.zip');
        await createZip(zipPath, [{ name: 'one.jpg', bytes: Buffer.from('not-decoded-until-worker') }]);
        const bytes = await fs.readFile(zipPath);
        await storage.writeChunk({ jobId, index: 0, buffer: bytes });

        expect(await storage.readChunkHash({ jobId, index: 0 }))
            .toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
        await storage.assemble({ jobId, chunkCount: 1 });
        const result = await storage.extractValidated({ jobId, expectedFilenames: ['one.jpg'] });

        expect(result.files).toHaveLength(1);
        expect(result.files[0]).toMatchObject({ filename: 'one.jpg', mimetype: 'image/jpeg' });
        expect(await fs.readFile(result.files[0].path, 'utf8')).toBe('not-decoded-until-worker');
    });

    test.each([
        ['nested entry', 'nested/one.jpg'],
        ['Windows separator', 'nested\\one.jpg'],
        ['parent marker', '..evil.jpg']
    ])('rejects %s without retaining extracted files', async (_label, filename) => {
        const zipPath = path.join(root, 'source.zip');
        await createZip(zipPath, [
            { name: 'one.jpg', bytes: Buffer.from('first') },
            { name: filename, bytes: Buffer.from('hostile') }
        ]);
        const bytes = await fs.readFile(zipPath);
        await storage.writeChunk({ jobId, index: 0, buffer: bytes });
        await storage.assemble({ jobId, chunkCount: 1 });

        await expect(storage.extractValidated({ jobId, expectedFilenames: ['one.jpg', filename] }))
            .rejects.toThrow(/unsafe ZIP entry/i);
        const extractedDir = storage.paths.extractedDirectory(jobId);
        expect(await fs.readdir(extractedDir)).toHaveLength(0);
    });

    test('rejects duplicate filenames case-insensitively', async () => {
        const zipPath = path.join(root, 'source.zip');
        await createZip(zipPath, [
            { name: 'one.jpg', bytes: Buffer.from('first') },
            { name: 'ONE.JPG', bytes: Buffer.from('second') }
        ]);
        const bytes = await fs.readFile(zipPath);
        await storage.writeChunk({ jobId, index: 0, buffer: bytes });
        await storage.assemble({ jobId, chunkCount: 1 });

        await expect(storage.extractValidated({ jobId, expectedFilenames: ['one.jpg'] }))
            .rejects.toThrow(/duplicate ZIP filename/i);
        expect(await fs.readdir(storage.paths.extractedDirectory(jobId))).toHaveLength(0);
    });

    test('rejects highly compressed expansion-ratio payloads', async () => {
        const zipPath = path.join(root, 'source.zip');
        await createZip(zipPath, [{ name: 'one.jpg', bytes: Buffer.alloc(256 * 1024) }]);
        const bytes = await fs.readFile(zipPath);
        await storage.writeChunk({ jobId, index: 0, buffer: bytes });
        await storage.assemble({ jobId, chunkCount: 1 });

        await expect(storage.extractValidated({ jobId, expectedFilenames: ['one.jpg'] }))
            .rejects.toThrow(/expansion-ratio limit/i);
        expect(await fs.readdir(storage.paths.extractedDirectory(jobId))).toHaveLength(0);
    });

    test('rejects invalid indices, counts, and empty chunks', async () => {
        await expect(storage.writeChunk({ jobId, index: -1, buffer: Buffer.from('x') }))
            .rejects.toThrow(/chunk index/i);
        await expect(storage.writeChunk({ jobId, index: 0, buffer: Buffer.alloc(0) }))
            .rejects.toThrow(/chunk size/i);
        await expect(storage.assemble({ jobId, chunkCount: 0 }))
            .rejects.toThrow(/chunk count/i);
    });

    test('does not overwrite an already persisted chunk', async () => {
        await storage.writeChunk({ jobId, index: 0, buffer: Buffer.from('first') });
        await expect(storage.writeChunk({ jobId, index: 0, buffer: Buffer.from('second') }))
            .rejects.toMatchObject({ code: 'EEXIST' });
        expect(await fs.readFile(storage.paths.chunkPath(jobId, 0), 'utf8')).toBe('first');
    });

    test('rejects non-UUID job identifiers before resolving paths', async () => {
        await expect(storage.create({ jobId: '../outside', manifestCsv: 'x' }))
            .rejects.toThrow(/job id/i);
    });
});

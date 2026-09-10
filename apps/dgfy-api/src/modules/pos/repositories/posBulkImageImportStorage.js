import crypto from 'crypto';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import yauzl from 'yauzl';
import {
    POS_BULK_IMAGE_IMPORT_ALLOWED_EXTENSIONS,
    POS_BULK_IMAGE_IMPORT_MAX_ARCHIVE_BYTES,
    POS_BULK_IMAGE_IMPORT_MAX_EXPANDED_BYTES,
    POS_BULK_IMAGE_IMPORT_MAX_EXPANSION_RATIO,
    POS_BULK_IMAGE_IMPORT_MAX_IMAGE_BYTES,
    POS_BULK_IMAGE_IMPORT_MAX_ZIP_ENTRIES,
    POS_BULK_IMAGE_IMPORT_MIME_BY_EXTENSION
} from '../../../config/posBulkImageImportFeature.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Private worker staging. Never place raw ZIPs or source images below /uploads:
// that tree is served publicly, while accepted imports may contain originals
// that must exist only until their 144px POS derivatives are committed.
const STORAGE_ROOT = path.resolve(__dirname, '../../../../storage/pos-image-imports');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FLAT_FILENAME_PATTERN = /^[^<>:"/\\|?*\u0000-\u001f]+$/;
const MAX_CHUNKS = Math.ceil(POS_BULK_IMAGE_IMPORT_MAX_ARCHIVE_BYTES / (6 * 1024 * 1024));

const requireJobId = (jobId) => {
    if (!UUID_PATTERN.test(String(jobId || ''))) throw new Error('Invalid POS image import job id');
    return String(jobId);
};

const requireChunkIndex = (index) => {
    const value = Number(index);
    if (!Number.isSafeInteger(value) || value < 0 || value >= MAX_CHUNKS) {
        throw new Error('Invalid POS image import chunk index');
    }
    return value;
};

const requireChunkCount = (count) => {
    const value = Number(count);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CHUNKS) {
        throw new Error('Invalid POS image import chunk count');
    }
    return value;
};

const assertWithin = (root, candidate) => {
    const normalizedRoot = `${path.resolve(root)}${path.sep}`;
    const normalizedCandidate = path.resolve(candidate);
    if (!normalizedCandidate.startsWith(normalizedRoot)) throw new Error('Unsafe POS image import storage path');
    return normalizedCandidate;
};

const openZip = (filePath) => new Promise((resolve, reject) => {
    yauzl.open(filePath, {
        autoClose: true,
        lazyEntries: true,
        decodeStrings: true,
        strictFileNames: true,
        validateEntrySizes: true
    }, (error, zipFile) => error ? reject(error) : resolve(zipFile));
});

const openEntryStream = (zipFile, entry) => new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream));
});

const isSymlink = (entry) => {
    const unixMode = (Number(entry.externalFileAttributes) >>> 16) & 0xffff;
    return (unixMode & 0o170000) === 0o120000;
};

const assertSafeEntry = (entry, totals) => {
    const filename = String(entry.fileName || '');
    if (!filename || !SAFE_FLAT_FILENAME_PATTERN.test(filename) || filename === '.' || filename === '..'
        || filename.includes('..') || path.basename(filename) !== filename) {
        throw new Error(`Nested or unsafe ZIP entry is not allowed: ${filename || '(empty)'}`);
    }
    if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new Error(`Encrypted ZIP entry is not allowed: ${filename}`);
    if (![0, 8].includes(Number(entry.compressionMethod))) throw new Error(`Unsupported ZIP compression method: ${filename}`);
    if (isSymlink(entry)) throw new Error(`ZIP links are not allowed: ${filename}`);

    const extension = path.extname(filename).toLowerCase();
    if (!POS_BULK_IMAGE_IMPORT_ALLOWED_EXTENSIONS.includes(extension)) {
        throw new Error(`Unsupported image extension in ZIP: ${filename}`);
    }
    const expanded = Number(entry.uncompressedSize || 0);
    const compressed = Number(entry.compressedSize || 0);
    if (expanded <= 0 || expanded > POS_BULK_IMAGE_IMPORT_MAX_IMAGE_BYTES) {
        throw new Error(`ZIP image exceeds the per-image size limit: ${filename}`);
    }
    if (compressed <= 0 || expanded / compressed > POS_BULK_IMAGE_IMPORT_MAX_EXPANSION_RATIO) {
        throw new Error(`ZIP image exceeds the expansion-ratio limit: ${filename}`);
    }
    totals.expanded += expanded;
    totals.compressed += compressed;
    if (totals.expanded > POS_BULK_IMAGE_IMPORT_MAX_EXPANDED_BYTES) throw new Error('ZIP expanded-size limit exceeded');
    if (totals.compressed > POS_BULK_IMAGE_IMPORT_MAX_ARCHIVE_BYTES) throw new Error('ZIP compressed-size limit exceeded');
    return { filename, extension, expanded };
};

export const createPosBulkImageImportStorage = ({ root = STORAGE_ROOT } = {}) => {
    const resolvedRoot = path.resolve(root);
    const rootForJob = (jobId) => assertWithin(resolvedRoot, path.join(resolvedRoot, requireJobId(jobId)));
    const pathForChunk = (jobId, index) => assertWithin(rootForJob(jobId), path.join(rootForJob(jobId), `chunk-${requireChunkIndex(index)}.part`));
    const pathForArchive = (jobId) => assertWithin(rootForJob(jobId), path.join(rootForJob(jobId), 'package.zip'));
    const pathForManifest = (jobId) => assertWithin(rootForJob(jobId), path.join(rootForJob(jobId), 'manifest.csv'));
    const pathForExtracted = (jobId) => assertWithin(rootForJob(jobId), path.join(rootForJob(jobId), 'images'));

    return {
        async create({ jobId, manifestCsv }) {
            await fs.mkdir(resolvedRoot, { recursive: true });
            await fs.mkdir(rootForJob(jobId), { recursive: false });
            await fs.writeFile(pathForManifest(jobId), manifestCsv, { encoding: 'utf8', flag: 'wx' });
            return { manifest_path: pathForManifest(jobId) };
        },

        async writeChunk({ jobId, index, buffer }) {
            if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > 6 * 1024 * 1024) {
                throw new Error('POS image import chunk size is outside the allowed range');
            }
            const target = pathForChunk(jobId, index);
            const handle = await fs.open(target, 'wx');
            let writeError = null;
            try {
                let offset = 0;
                while (offset < buffer.length) {
                    const { bytesWritten } = await handle.write(buffer, offset);
                    if (bytesWritten <= 0) throw new Error('Failed to persist POS image import chunk');
                    offset += bytesWritten;
                }
                await handle.sync();
            } catch (error) {
                writeError = error;
            } finally {
                await handle.close();
            }
            if (writeError) {
                await fs.unlink(target).catch(() => {});
                throw writeError;
            }
            return target;
        },

        async readChunkHash({ jobId, index }) {
            const bytes = await fs.readFile(pathForChunk(jobId, index));
            return crypto.createHash('sha256').update(bytes).digest('hex');
        },

        async assemble({ jobId, chunkCount }) {
            const normalizedChunkCount = requireChunkCount(chunkCount);
            const target = pathForArchive(jobId);
            const temporary = `${target}.${crypto.randomUUID()}.tmp`;
            const handle = await fs.open(temporary, 'wx');
            let assemblyError = null;
            try {
                for (let index = 0; index < normalizedChunkCount; index += 1) {
                    const bytes = await fs.readFile(pathForChunk(jobId, index));
                    let offset = 0;
                    while (offset < bytes.length) {
                        const { bytesWritten } = await handle.write(bytes, offset);
                        if (bytesWritten <= 0) throw new Error('Failed to assemble POS image import archive');
                        offset += bytesWritten;
                    }
                }
                await handle.sync();
            } catch (error) {
                assemblyError = error;
            } finally {
                await handle.close();
            }
            if (assemblyError) {
                await fs.unlink(temporary).catch(() => {});
                throw assemblyError;
            }
            const stats = await fs.stat(temporary);
            if (stats.size <= 0 || stats.size > POS_BULK_IMAGE_IMPORT_MAX_ARCHIVE_BYTES) {
                await fs.unlink(temporary).catch(() => {});
                throw new Error('Assembled ZIP size is outside the allowed range');
            }
            await fs.rename(temporary, target);
            return { archive_path: target, size: stats.size };
        },

        async extractValidated({ jobId, expectedFilenames }) {
            const expected = new Map([...expectedFilenames].map((name) => [String(name).toLowerCase(), String(name)]));
            const seen = new Set();
            const extracted = [];
            let activeOutputPath = null;
            const totals = { entries: 0, expanded: 0, compressed: 0 };
            await fs.mkdir(pathForExtracted(jobId), { recursive: true });
            const zipFile = await openZip(pathForArchive(jobId));

            try {
                await new Promise((resolve, reject) => {
                    const fail = (error) => { try { zipFile.close(); } catch {} reject(error); };
                    zipFile.once('error', fail);
                    zipFile.once('end', resolve);
                    zipFile.on('entry', async (entry) => {
                        try {
                            totals.entries += 1;
                            if (totals.entries > POS_BULK_IMAGE_IMPORT_MAX_ZIP_ENTRIES) throw new Error('ZIP entry-count limit exceeded');
                            const safe = assertSafeEntry(entry, totals);
                            const key = safe.filename.toLowerCase();
                            if (seen.has(key)) throw new Error(`Duplicate ZIP filename: ${safe.filename}`);
                            if (!expected.has(key)) throw new Error(`ZIP image is not present in the CSV manifest: ${safe.filename}`);
                            seen.add(key);

                            const outputPath = path.join(pathForExtracted(jobId), `${crypto.randomUUID()}${safe.extension}`);
                            activeOutputPath = outputPath;
                            let written = 0;
                            const limiter = new Transform({
                                transform(chunk, encoding, callback) {
                                    written += chunk.length;
                                    callback(written > POS_BULK_IMAGE_IMPORT_MAX_IMAGE_BYTES
                                        ? new Error(`Expanded image exceeds limit: ${safe.filename}`) : null, chunk);
                                }
                            });
                            const input = await openEntryStream(zipFile, entry);
                            const output = createWriteStream(outputPath, { flags: 'wx' });
                            await pipeline(input, limiter, output);
                            if (written !== safe.expanded) throw new Error(`ZIP entry size mismatch: ${safe.filename}`);
                            extracted.push({
                                filename: expected.get(key),
                                path: outputPath,
                                size: written,
                                mimetype: POS_BULK_IMAGE_IMPORT_MIME_BY_EXTENSION[safe.extension]
                            });
                            activeOutputPath = null;
                            zipFile.readEntry();
                        } catch (error) {
                            fail(error);
                        }
                    });
                    zipFile.readEntry();
                });
                const missing = [...expected.keys()].filter((key) => !seen.has(key));
                if (missing.length > 0) throw new Error(`CSV image is missing from ZIP: ${expected.get(missing[0])}`);
                return { files: extracted, totals };
            } catch (error) {
                if (activeOutputPath) await fs.unlink(activeOutputPath).catch(() => {});
                await Promise.all(extracted.map((file) => fs.unlink(file.path).catch(() => {})));
                throw error;
            }
        },

        async cleanupChunks({ jobId, chunkCount }) {
            const normalizedChunkCount = requireChunkCount(chunkCount);
            await Promise.all(Array.from({ length: normalizedChunkCount }, (_, index) => fs.unlink(pathForChunk(jobId, index)).catch(() => {})));
        },

        async cleanupPackageArtifacts({ jobId }) {
            await Promise.all([
                fs.unlink(pathForArchive(jobId)).catch(() => {}),
                fs.unlink(pathForManifest(jobId)).catch(() => {})
            ]);
        },

        async cleanup({ jobId }) {
            await fs.rm(rootForJob(jobId), { recursive: true, force: true });
        },

        paths: {
            jobDirectory: rootForJob,
            chunkPath: pathForChunk,
            archivePath: pathForArchive,
            manifestPath: pathForManifest,
            extractedDirectory: pathForExtracted
        }
    };
};

export const posBulkImageImportStorage = createPosBulkImageImportStorage();

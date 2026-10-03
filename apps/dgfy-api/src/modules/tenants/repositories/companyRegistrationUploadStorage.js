import crypto from 'crypto';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';

const root = () => path.resolve(process.env.COMPANY_REGISTRATION_UPLOAD_ROOT || path.join(process.cwd(), 'storage', 'company-registration-uploads'));

const safePath = (storageKey) => {
    const base = root();
    const resolved = path.resolve(base, storageKey);
    if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error('Invalid company-registration upload storage key.');
    return resolved;
};

const segment = (value) => String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'unknown';

export const companyRegistrationUploadStorage = {
    async write({ applicationId, attemptNo, kind, extension, buffer }) {
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Upload content is empty.');
        const storageKey = path.posix.join(segment(applicationId), `attempt-${segment(attemptNo)}`, segment(kind), `${crypto.randomUUID()}.${segment(extension).toLowerCase()}`);
        const target = safePath(storageKey);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, buffer, { flag: 'wx' });
        return {
            storage_key: storageKey,
            byte_size: buffer.length,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex')
        };
    },
    async read(storageKey) {
        return fs.readFile(safePath(storageKey));
    },
    createReadStream(storageKey) {
        return fsSync.createReadStream(safePath(storageKey));
    },
    async remove(storageKey) {
        if (!storageKey) return;
        await fs.unlink(safePath(storageKey)).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        });
    }
};

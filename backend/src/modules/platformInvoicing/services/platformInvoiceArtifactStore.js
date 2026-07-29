import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const root = () => path.resolve(process.env.PLATFORM_INVOICE_ARTIFACT_ROOT || path.join(process.cwd(), 'storage', 'platform-invoices'));
const safePath = (storageKey) => {
  const resolved = path.resolve(root(), storageKey);
  if (!resolved.startsWith(`${root()}${path.sep}`)) throw new Error('Invalid platform invoice artifact key.');
  return resolved;
};

export const platformInvoiceArtifactStore = {
  async put({ invoiceId, invoiceNumber, mode = 'qa', buffer }) {
    if (!Buffer.isBuffer(buffer)) throw new Error('Invoice artifact content must be a Buffer.');
    const storageKey = path.posix.join(mode === 'live' ? 'live' : 'qa', invoiceId, `${crypto.randomUUID()}.pdf`);
    const filename = `DGFY-${String(invoiceNumber).replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
    const target = safePath(storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { flag: 'wx' });
    return { storage_key: storageKey, filename, content_type: 'application/pdf', size_bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  },
  async read(artifact) {
    const buffer = await fs.readFile(safePath(artifact.storage_key));
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (hash !== artifact.sha256) throw new Error('Platform invoice artifact integrity check failed.');
    return buffer;
  },
  async remove(storageKey) {
    await fs.unlink(safePath(storageKey)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
};

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { validateImageUploadFile } from '../src/modules/shared/utils/imageUploadValidation.js';

const makeTempFile = async (bytes = Buffer.alloc(0)) => {
  const filePath = path.join(os.tmpdir(), `img-validate-${Date.now()}-${crypto.randomUUID()}`);
  await fs.writeFile(filePath, bytes);
  return filePath;
};

describe('imageUploadValidation util', () => {
  it('accepts PNG when mime and signature match', async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    const filePath = await makeTempFile(pngHeader);
    const result = await validateImageUploadFile({
      file: { path: filePath, mimetype: 'image/png', size: pngHeader.length }
    });
    await fs.unlink(filePath);

    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe('image/png');
  });

  it('rejects mime/signature mismatch', async () => {
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00]);
    const filePath = await makeTempFile(jpegHeader);
    const result = await validateImageUploadFile({
      file: { path: filePath, mimetype: 'image/png', size: jpegHeader.length }
    });
    await fs.unlink(filePath);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('mime_signature_mismatch');
  });

  it('rejects unsupported signatures even when mime looks image-like', async () => {
    const plainText = Buffer.from('<svg><script>alert(1)</script></svg>', 'utf8');
    const filePath = await makeTempFile(plainText);
    const result = await validateImageUploadFile({
      file: { path: filePath, mimetype: 'image/svg+xml', size: plainText.length }
    });
    await fs.unlink(filePath);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported_reported_mime');
  });
});


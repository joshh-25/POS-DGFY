import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { validateImageUploadFile, validateClientVariant } from '../src/modules/shared/utils/imageUploadValidation.js';

const makeTempFile = async (bytes = Buffer.alloc(0)) => {
  const filePath = path.join(os.tmpdir(), `img-validate-${Date.now()}-${crypto.randomUUID()}`);
  await fs.writeFile(filePath, bytes);
  return filePath;
};

describe('imageUploadValidation util', () => {
  // Release libvips cached file handles before Windows fixture cleanup.
  beforeAll(() => sharp.cache(false));
  afterAll(() => sharp.cache(true));
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

  // Phase 301 (#265): validateClientVariant is the trust-boundary check for a client-supplied,
  // already-optimized image_medium/image_thumbnail (or accepted-large) file -- these tests never
  // touch validateImageUploadFile's own logic above, confirming the existing mime_signature_mismatch
  // test (unmodified) still proves that boundary didn't move.
  describe('validateClientVariant', () => {
    it('accepts a variant matching the expected format, width, and pixel cap', async () => {
      const filePath = path.join(os.tmpdir(), `variant-ok-${Date.now()}-${crypto.randomUUID()}.webp`);
      await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } }
      }).webp({ quality: 80 }).toFile(filePath);

      const result = await validateClientVariant({
        file: { path: filePath },
        expectedFormat: 'webp',
        targetWidth: 400,
        maxPixels: 40 * 1024 * 1024
      });
      await fs.unlink(filePath);

      expect(result.ok).toBe(true);
      expect(result.format).toBe('webp');
      expect(result.width).toBe(400);
    });

    it('rejects a format mismatch (client sent png, server expected webp)', async () => {
      const filePath = path.join(os.tmpdir(), `variant-format-${Date.now()}-${crypto.randomUUID()}.png`);
      await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } }
      }).png().toFile(filePath);

      const result = await validateClientVariant({
        file: { path: filePath },
        expectedFormat: 'webp',
        targetWidth: 400,
        maxPixels: 40 * 1024 * 1024
      });
      await fs.unlink(filePath);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('format_mismatch');
      expect(result.detectedFormat).toBe('png');
    });

    it('rejects a variant wider than its target (never trusts an oversized "already resized" claim)', async () => {
      const filePath = path.join(os.tmpdir(), `variant-wide-${Date.now()}-${crypto.randomUUID()}.webp`);
      await sharp({
        create: { width: 2000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } }
      }).webp({ quality: 80 }).toFile(filePath);

      const result = await validateClientVariant({
        file: { path: filePath },
        expectedFormat: 'webp',
        targetWidth: 1024,
        maxPixels: 40 * 1024 * 1024
      });
      await fs.unlink(filePath);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('width_exceeds_target');
      expect(result.width).toBe(2000);
    });

    it('rejects a variant exceeding the pixel cap even when narrower than the target width', async () => {
      const filePath = path.join(os.tmpdir(), `variant-pixels-${Date.now()}-${crypto.randomUUID()}.webp`);
      await sharp({
        create: { width: 900, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } }
      }).webp({ quality: 80 }).toFile(filePath);

      const result = await validateClientVariant({
        file: { path: filePath },
        expectedFormat: 'webp',
        targetWidth: 1920,
        maxPixels: 900 * 900 - 1
      });
      await fs.unlink(filePath);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('pixel_cap_exceeded');
    });

    it('rejects a file that cannot be read as an image at all', async () => {
      const filePath = path.join(os.tmpdir(), `variant-unreadable-${Date.now()}-${crypto.randomUUID()}.webp`);
      await fs.writeFile(filePath, Buffer.from('not an image', 'utf8'));

      const result = await validateClientVariant({
        file: { path: filePath },
        expectedFormat: 'webp',
        targetWidth: 1920,
        maxPixels: 40 * 1024 * 1024
      });
      await fs.unlink(filePath);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('metadata_read_failed');
    });
  });
});


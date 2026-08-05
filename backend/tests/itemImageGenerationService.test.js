import { jest } from '@jest/globals';
import fs from 'fs/promises';
import sharp from 'sharp';

// Mirrors tests/menuExtractionService.test.js's OpenAI mocking shape — this
// suite never makes a live API call. The watermark compositing itself runs
// for real against the committed backend/assets/dgfy-watermark.png, since
// that's the part most likely to break silently (a bad crop/blend).
const mockGenerate = jest.fn();
class MockOpenAI {
    constructor() {
        this.images = { generate: mockGenerate };
    }
}

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('openai', () => ({ default: MockOpenAI }));
jest.unstable_mockModule('../src/config/logger.js', () => ({ default: mockLogger }));

let generateItemImage;
let ItemImageGenerationError;

// A small synthetic base "photo" stands in for what OpenAI would return —
// real dimensions matter here because the watermark is sized as a fraction
// of the base image's width.
const buildFakeGeneratedImageB64 = async () => {
    const buffer = await sharp({
        create: { width: 512, height: 512, channels: 3, background: { r: 200, g: 120, b: 60 } }
    }).png().toBuffer();
    return buffer.toString('base64');
};

beforeAll(async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const mod = await import('../src/services/itemImageGenerationService.js');
    generateItemImage = mod.generateItemImage;
    ItemImageGenerationError = mod.ItemImageGenerationError;
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('generateItemImage', () => {
    it('generates, watermarks, and writes a temp PNG with the expected provenance/usage shape', async () => {
        const b64 = await buildFakeGeneratedImageB64();
        mockGenerate.mockResolvedValue({ data: [{ b64_json: b64 }] });

        const result = await generateItemImage({ name: 'Sisig', description: 'Sizzling pork sisig', category: 'Mains' });

        expect(mockGenerate).toHaveBeenCalledTimes(1);
        const [requestArgs] = mockGenerate.mock.calls[0];
        expect(requestArgs.prompt).toContain('Sisig');
        expect(requestArgs.model).toBe('gpt-image-2');

        expect(result.mimetype).toBe('image/png');
        expect(result.path).toMatch(/dgfy-item-image-.*\.png$/);
        expect(result.originalname).toMatch(/^ai-generated-.*\.png$/);
        expect(result.size).toBeGreaterThan(0);

        // Must land under backend/uploads/temp/, NOT os.tmpdir() -- every
        // deployed environment mounts uploads/ as its own volume, so a temp
        // file outside that tree fails with EXDEV when
        // storeOptimizedImageAsset later renames it into uploads/originals/.
        expect(result.path).toMatch(/[/\\]uploads[/\\]temp[/\\]dgfy-item-image-/);

        expect(result.provenance).toEqual({
            type: 'ai_generated',
            model: 'gpt-image-2',
            source: 'knowledge',
            watermarked: true,
            generated_at: expect.any(String)
        });
        expect(result.usage).toEqual({
            model: 'gpt-image-2',
            sizeTier: '1K',
            costUsd: expect.any(Number),
            estimated: false
        });

        // The written file is a real, larger-than-base image (watermark
        // composited in), not just the raw bytes echoed back untouched.
        const written = await fs.readFile(result.path);
        expect(written.length).toBeGreaterThan(0);
        const meta = await sharp(written).metadata();
        expect(meta.width).toBe(512);
        expect(meta.height).toBe(512);
        expect(meta.format).toBe('png');

        await fs.unlink(result.path).catch(() => {});
    });

    it('throws ItemImageGenerationError with NAME_REQUIRED when name is blank', async () => {
        await expect(generateItemImage({ name: '  ' })).rejects.toMatchObject({
            name: 'ItemImageGenerationError',
            code: 'NAME_REQUIRED'
        });
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('wraps an OpenAI request failure in ItemImageGenerationError without leaving a temp file behind', async () => {
        mockGenerate.mockRejectedValue(new Error('rate limited'));

        await expect(generateItemImage({ name: 'Adobo' })).rejects.toBeInstanceOf(ItemImageGenerationError);
        await expect(generateItemImage({ name: 'Adobo' })).rejects.toMatchObject({ code: 'GENERATION_REQUEST_FAILED' });
    });

    it('throws GENERATION_EMPTY_RESPONSE when OpenAI returns no image data', async () => {
        mockGenerate.mockResolvedValue({ data: [] });
        await expect(generateItemImage({ name: 'Lumpia' })).rejects.toMatchObject({ code: 'GENERATION_EMPTY_RESPONSE' });
    });
});

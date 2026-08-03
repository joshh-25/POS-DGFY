/**
 * Item Image Generation Service
 *
 * Shared, DB-agnostic image generator for items with no photo — used by both
 * the batch menu-import review step (workers/itemImageWorker.js, from #176)
 * and the standalone "Generate an Image" action for existing items (#197).
 * No DB access, no tenant context: callers own persistence (via
 * modules/inventory/usecases/storefrontCatalogUseCases.js's
 * buildUploadStorefrontCatalogImageUseCase, the same use case a manual
 * upload or a barcode-registry import already goes through).
 *
 * generateItemImage({name, description, category})
 *   -> OpenAI images.generate() with itemImageGenerationModel()
 *   -> b64_json -> Buffer
 *   -> sharp watermark composite (DGFY logo, fixed corner, fixed opacity —
 *      not the model drawing it into the scene, which is unreliable for
 *      legibility/placement)
 *   -> written to a temp file, same os.tmpdir() convention as
 *      importExternalProductImageUseCase.js's barcode-registry photo import
 *   -> { path, originalname, mimetype, size, provenance, usage }
 *
 * Mirrors menuExtractionService.js's MenuExtractionError shape with its own
 * ItemImageGenerationError, and its lazy-singleton OpenAI client pattern.
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import sharp from 'sharp';
import logger from '../config/logger.js';
import { itemImageGenerationModel, itemImageSizeTier } from '../config/itemImageFeature.js';
import { resolveImageModelRate } from '../config/aiModelRates.js';

export class ItemImageGenerationError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = 'ItemImageGenerationError';
        this.code = code;
        this.details = details;
    }
}

const WATERMARK_PATH = fileURLToPath(new URL('../../assets/dgfy-watermark.png', import.meta.url));

// OpenAI's gpt-image family prices by (size, quality), not by a "1K/2K/4K"
// resolution label — the size tier this service and config/aiModelRates.js
// share is an abstraction over that, not a literal pixel dimension. Item
// photos are product shots, so a fixed square output size is the right
// default across all tiers; quality is what actually moves cost and result
// fidelity, so that's what the tier maps onto.
const SIZE_TIER_TO_REQUEST_PARAMS = {
    '1K': { size: '1024x1024', quality: 'low' },
    '2K': { size: '1024x1024', quality: 'medium' },
    '4K': { size: '1024x1024', quality: 'high' }
};

// Watermark composite: bottom-right corner, sized to a fraction of the
// generated image's width, at a fixed opacity — legible but not obtrusive
// over a food photo of unknown color balance.
const WATERMARK_WIDTH_FRACTION = 0.22;
const WATERMARK_OPACITY = 0.55;

let _openai = null;
const getOpenAiClient = () => {
    if (!_openai) {
        if (!process.env.OPENAI_API_KEY) {
            throw new ItemImageGenerationError('OPENAI_API_KEY is not configured.', 'OPENAI_NOT_CONFIGURED');
        }
        _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return _openai;
};

const buildPrompt = ({ name, description, category }) => {
    const parts = [
        `A professional, appetizing product photograph of a menu item called "${String(name || '').trim()}".`
    ];
    if (description) parts.push(`Description: ${String(description).trim()}.`);
    if (category) parts.push(`Menu category: ${String(category).trim()}.`);
    parts.push(
        'Studio lighting, shallow depth of field, centered on a plain or lightly-textured background, no text or logos in the image, no people, no packaging with any brand names.'
    );
    return parts.join(' ');
};

/**
 * Composites the DGFY watermark onto a generated image buffer, bottom-right,
 * at a fixed size fraction and opacity. sharp's `dest-in` blend against a
 * uniformly semi-transparent mask is the standard way to apply opacity to an
 * overlay that already carries its own alpha channel — `.composite()` itself
 * has no opacity option.
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>} PNG buffer with the watermark applied
 */
const applyWatermark = async (imageBuffer) => {
    const baseImage = sharp(imageBuffer);
    const baseMeta = await baseImage.metadata();
    const targetWatermarkWidth = Math.max(1, Math.round((baseMeta.width || 1024) * WATERMARK_WIDTH_FRACTION));

    const watermarkResized = await sharp(WATERMARK_PATH)
        .resize({ width: targetWatermarkWidth })
        .ensureAlpha()
        .toBuffer();
    const watermarkMeta = await sharp(watermarkResized).metadata();

    const opacityMask = await sharp({
        create: {
            width: watermarkMeta.width,
            height: watermarkMeta.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: WATERMARK_OPACITY }
        }
    }).png().toBuffer();

    const semiTransparentWatermark = await sharp(watermarkResized)
        .composite([{ input: opacityMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

    return baseImage
        .composite([{ input: semiTransparentWatermark, gravity: 'southeast' }])
        .png()
        .toBuffer();
};

/**
 * Generates a watermarked item photo and writes it to a temp file.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.description]
 * @param {string} [params.category]
 * @returns {Promise<{path: string, originalname: string, mimetype: string, size: number, provenance: Object, usage: {model: string, sizeTier: string, costUsd: number, estimated: boolean}}>}
 * @throws {ItemImageGenerationError}
 */
export const generateItemImage = async ({ name, description = null, category = null } = {}) => {
    if (!String(name || '').trim()) {
        throw new ItemImageGenerationError('name is required to generate an item image.', 'NAME_REQUIRED');
    }

    const model = itemImageGenerationModel();
    const sizeTier = itemImageSizeTier();
    const requestParams = SIZE_TIER_TO_REQUEST_PARAMS[sizeTier] || SIZE_TIER_TO_REQUEST_PARAMS['1K'];

    let response;
    try {
        const client = getOpenAiClient();
        response = await client.images.generate({
            model,
            prompt: buildPrompt({ name, description, category }),
            n: 1,
            ...requestParams
        });
    } catch (error) {
        logger.error('[ItemImageGenerationService] OpenAI image generation request failed', {
            model,
            reason: error?.message
        });
        throw new ItemImageGenerationError(
            'Image generation request failed.',
            'GENERATION_REQUEST_FAILED',
            { message: error?.message }
        );
    }

    const b64 = response?.data?.[0]?.b64_json;
    if (!b64) {
        throw new ItemImageGenerationError('Image generation returned no image data.', 'GENERATION_EMPTY_RESPONSE');
    }

    const rawImageBuffer = Buffer.from(b64, 'base64');
    const watermarkedBuffer = await applyWatermark(rawImageBuffer);

    const tempPath = path.join(os.tmpdir(), `dgfy-item-image-${randomUUID()}.png`);
    await fs.writeFile(tempPath, watermarkedBuffer, { flag: 'wx' });

    const { usd: costUsd, estimated } = resolveImageModelRate(model, sizeTier);
    const generatedAt = new Date().toISOString();

    return {
        path: tempPath,
        originalname: `ai-generated-${randomUUID()}.png`,
        mimetype: 'image/png',
        size: watermarkedBuffer.length,
        provenance: {
            type: 'ai_generated',
            model,
            source: 'knowledge',
            watermarked: true,
            generated_at: generatedAt
        },
        usage: { model, sizeTier, costUsd, estimated }
    };
};

export default { generateItemImage, ItemImageGenerationError };

import { describe, expect, it } from 'vitest';
import {
    analyzeMenuPhotoQuality,
    MENU_PHOTO_QUALITY_WARNING,
    MENU_PHOTO_QUALITY_THRESHOLDS
} from '../menuPhotoQuality.js';

const WIDTH = 64;
const HEIGHT = 64;

// Builds an RGBA buffer from a per-pixel luma function.
const frameFrom = (lumaAt, width = WIDTH, height = HEIGHT) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const value = Math.max(0, Math.min(255, Math.round(lumaAt(x, y))));
            const index = (y * width + x) * 4;
            data[index] = value;
            data[index + 1] = value;
            data[index + 2] = value;
            data[index + 3] = 255;
        }
    }
    return { data, width, height };
};

// Alternating columns — stands in for the dense high-contrast edges of menu text.
const sharpText = (mid = 128, swing = 110) => frameFrom((x) => (x % 2 === 0 ? mid + swing : mid - swing));
// Smooth gradient — plenty of dynamic range, no edges. This is what motion blur looks like.
const smoothBlur = (mid = 128) => frameFrom((x) => mid + (x / WIDTH) * 8);

const codesOf = (result) => result.warnings.map((warning) => warning.code);
const source = { sourceWidth: 1920, sourceHeight: 1080 };

describe('analyzeMenuPhotoQuality', () => {
    it('passes a sharp, well-exposed frame with no warnings', () => {
        const result = analyzeMenuPhotoQuality(sharpText(), source);

        expect(result.warnings).toEqual([]);
        expect(result.level).toBe('ok');
        expect(result.sharpness).toBeGreaterThan(MENU_PHOTO_QUALITY_THRESHOLDS.minSharpness);
    });

    it('flags a frame with no sharp edges as blurry', () => {
        const result = analyzeMenuPhotoQuality(smoothBlur(), source);

        expect(codesOf(result)).toContain(MENU_PHOTO_QUALITY_WARNING.BLURRY);
        expect(result.level).toBe('warn');
    });

    it('flags underexposure and overexposure from mean luma', () => {
        const dark = analyzeMenuPhotoQuality(sharpText(20, 15), source);
        expect(codesOf(dark)).toContain(MENU_PHOTO_QUALITY_WARNING.TOO_DARK);

        const bright = analyzeMenuPhotoQuality(sharpText(235, 15), source);
        expect(codesOf(bright)).toContain(MENU_PHOTO_QUALITY_WARNING.TOO_BRIGHT);
    });

    it('flags glare when a patch of the frame is clipped to white', () => {
        // A sharp, correctly-exposed frame with a blown-out 20% corner patch.
        const glareEdge = Math.round(WIDTH * 0.45);
        const withGlare = frameFrom((x, y) => (
            x < glareEdge && y < glareEdge ? 255 : (x % 2 === 0 ? 238 : 18)
        ));

        const result = analyzeMenuPhotoQuality(withGlare, source);

        expect(result.glareRatio).toBeGreaterThan(MENU_PHOTO_QUALITY_THRESHOLDS.maxGlareRatio);
        expect(codesOf(result)).toContain(MENU_PHOTO_QUALITY_WARNING.GLARE);
    });

    it('judges resolution on the source frame, not on the downsampled sample', () => {
        const sample = sharpText();

        // A 64px analysis sample taken from a 1920x1080 frame is not low-res...
        expect(codesOf(analyzeMenuPhotoQuality(sample, source)))
            .not.toContain(MENU_PHOTO_QUALITY_WARNING.LOW_RESOLUTION);

        // ...but the same sample from a genuinely small frame is.
        expect(codesOf(analyzeMenuPhotoQuality(sample, { sourceWidth: 480, sourceHeight: 320 })))
            .toContain(MENU_PHOTO_QUALITY_WARNING.LOW_RESOLUTION);
    });

    it('never blocks, no matter how bad the frame is', () => {
        const worstCase = frameFrom(() => 255); // blown out, no edges, no detail

        const result = analyzeMenuPhotoQuality(worstCase, { sourceWidth: 120, sourceHeight: 90 });

        expect(result.warnings.length).toBeGreaterThan(2);
        expect(result.blocking).toBe(false);
    });

    it('returns a neutral result for an empty or malformed frame', () => {
        expect(analyzeMenuPhotoQuality(null)).toMatchObject({ warnings: [], level: 'ok', blocking: false });
        expect(analyzeMenuPhotoQuality({ width: 0, height: 0, data: new Uint8ClampedArray() }))
            .toMatchObject({ warnings: [], level: 'ok', blocking: false });
    });

    it('carries a human-readable message on every warning', () => {
        const result = analyzeMenuPhotoQuality(smoothBlur(20), { sourceWidth: 320, sourceHeight: 240 });

        expect(result.warnings.length).toBeGreaterThan(0);
        result.warnings.forEach((warning) => {
            expect(typeof warning.message).toBe('string');
            expect(warning.message.length).toBeGreaterThan(0);
        });
    });
});

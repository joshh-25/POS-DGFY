/**
 * Menu photo quality heuristics — pure, no DOM.
 *
 * Scores a captured (or about-to-be-captured) frame for the four ways a phone
 * photo of a menu board usually defeats OCR: motion blur, underexposure,
 * blown-out highlights, and specular glare across laminated/backlit menus.
 *
 * These are advisory heuristics, deliberately not a gate: every check returns
 * a warning and `blocking` is always false. A cheap threshold cannot tell a
 * genuinely unreadable photo from an unusual but perfectly legible menu (dark
 * chalkboard, spotlit letterboard), and refusing an operator's photo on that
 * basis would be worse than letting the extraction try and letting them see
 * the result. Same philosophy as the batch importer's price conflicts and
 * truncated scans: surface the problem, never silently decide.
 */

export const MENU_PHOTO_QUALITY_THRESHOLDS = Object.freeze({
    // Std-dev of the Laplacian over the luma plane. Low means "no sharp edges
    // anywhere", which for a menu (dense high-contrast text) means blur.
    minSharpness: 10,
    // Mean luma, 0-255.
    minBrightness: 45,
    maxBrightness: 215,
    // Fraction of near-saturated pixels — a bright photo is fine, a bright
    // photo with 6%+ of it clipped to white is glare sitting on top of text.
    maxGlareRatio: 0.06,
    // Shortest edge of the *source* frame, before any analysis downsampling.
    minSourceEdge: 640
});

export const MENU_PHOTO_QUALITY_WARNING = Object.freeze({
    BLURRY: 'BLURRY',
    TOO_DARK: 'TOO_DARK',
    TOO_BRIGHT: 'TOO_BRIGHT',
    GLARE: 'GLARE',
    LOW_RESOLUTION: 'LOW_RESOLUTION'
});

const WARNING_MESSAGES = Object.freeze({
    [MENU_PHOTO_QUALITY_WARNING.BLURRY]: 'Looks blurry — hold still and let the camera focus.',
    [MENU_PHOTO_QUALITY_WARNING.TOO_DARK]: 'Too dark — move somewhere brighter or turn on more light.',
    [MENU_PHOTO_QUALITY_WARNING.TOO_BRIGHT]: 'Very bright — step out of direct light so the text stays readable.',
    [MENU_PHOTO_QUALITY_WARNING.GLARE]: 'Glare is covering part of the menu — change your angle.',
    [MENU_PHOTO_QUALITY_WARNING.LOW_RESOLUTION]: 'Low resolution — move closer so the text fills more of the frame.'
});

export const menuPhotoWarningMessage = (code) => WARNING_MESSAGES[code] || 'This photo may be hard to read.';

const GLARE_LUMA = 250;

// Rec. 601 luma. Integer weights keep this cheap — it runs on every sampled
// preview frame.
const lumaAt = (data, index) => (
    (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000
);

const toLumaPlane = (imageData) => {
    const { data, width, height } = imageData;
    const plane = new Float32Array(width * height);
    for (let i = 0; i < plane.length; i += 1) {
        plane[i] = lumaAt(data, i * 4);
    }
    return plane;
};

/**
 * Std-dev of the 4-neighbour Laplacian. Higher = more sharp detail.
 */
const sharpnessOf = (plane, width, height) => {
    if (width < 3 || height < 3) return 0;

    let sum = 0;
    let sumSquares = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const index = y * width + x;
            const laplacian = (4 * plane[index])
                - plane[index - 1]
                - plane[index + 1]
                - plane[index - width]
                - plane[index + width];
            sum += laplacian;
            sumSquares += laplacian * laplacian;
            count += 1;
        }
    }

    if (count === 0) return 0;
    const mean = sum / count;
    const variance = Math.max((sumSquares / count) - (mean * mean), 0);
    return Math.sqrt(variance);
};

/**
 * Scores one frame.
 *
 * @param {{data: Uint8ClampedArray|number[], width: number, height: number}} imageData
 *   Typically a downsampled `CanvasRenderingContext2D.getImageData()` result —
 *   the caller samples small (analysis is per-pixel and runs on a timer).
 * @param {{sourceWidth?: number, sourceHeight?: number}} [source]
 *   Dimensions of the real frame, when `imageData` is a downsampled sample.
 *   Resolution is judged against these, never against the sample.
 * @returns {{sharpness: number, brightness: number, glareRatio: number,
 *   warnings: Array<{code: string, message: string}>, level: 'ok'|'warn',
 *   blocking: false}}
 */
export const analyzeMenuPhotoQuality = (imageData, { sourceWidth, sourceHeight } = {}) => {
    const width = imageData?.width || 0;
    const height = imageData?.height || 0;
    const data = imageData?.data;

    if (!data || width < 1 || height < 1) {
        return { sharpness: 0, brightness: 0, glareRatio: 0, warnings: [], level: 'ok', blocking: false };
    }

    const plane = toLumaPlane({ data, width, height });

    let lumaTotal = 0;
    let glarePixels = 0;
    for (let i = 0; i < plane.length; i += 1) {
        lumaTotal += plane[i];
        if (plane[i] >= GLARE_LUMA) glarePixels += 1;
    }

    const brightness = lumaTotal / plane.length;
    const glareRatio = glarePixels / plane.length;
    const sharpness = sharpnessOf(plane, width, height);

    const shortestSourceEdge = Math.min(sourceWidth || width, sourceHeight || height);

    const codes = [];
    if (sharpness < MENU_PHOTO_QUALITY_THRESHOLDS.minSharpness) codes.push(MENU_PHOTO_QUALITY_WARNING.BLURRY);
    if (brightness < MENU_PHOTO_QUALITY_THRESHOLDS.minBrightness) codes.push(MENU_PHOTO_QUALITY_WARNING.TOO_DARK);
    if (brightness > MENU_PHOTO_QUALITY_THRESHOLDS.maxBrightness) codes.push(MENU_PHOTO_QUALITY_WARNING.TOO_BRIGHT);
    if (glareRatio > MENU_PHOTO_QUALITY_THRESHOLDS.maxGlareRatio) codes.push(MENU_PHOTO_QUALITY_WARNING.GLARE);
    if (shortestSourceEdge < MENU_PHOTO_QUALITY_THRESHOLDS.minSourceEdge) codes.push(MENU_PHOTO_QUALITY_WARNING.LOW_RESOLUTION);

    return {
        sharpness,
        brightness,
        glareRatio,
        warnings: codes.map((code) => ({ code, message: menuPhotoWarningMessage(code) })),
        level: codes.length > 0 ? 'warn' : 'ok',
        // Always false, by product decision. Do not turn this into a gate.
        blocking: false
    };
};

export default analyzeMenuPhotoQuality;

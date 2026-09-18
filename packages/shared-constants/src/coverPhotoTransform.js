export const COVER_PHOTO_TRANSFORM_DEFAULT = Object.freeze({
    x: 0,
    y: 0,
    scale: 1
});

export const COVER_PHOTO_TRANSFORM_MIN_POSITION = -100;
export const COVER_PHOTO_TRANSFORM_MAX_POSITION = 100;
export const COVER_PHOTO_TRANSFORM_MIN_SCALE = 1;
export const COVER_PHOTO_TRANSFORM_MAX_SCALE = 2.5;
export const COVER_PHOTO_TRANSFORM_PRECISION = 4;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundToPrecision = (value, precision = COVER_PHOTO_TRANSFORM_PRECISION) => {
    const factor = 10 ** precision;
    const rounded = Math.round(value * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
};

const toFiniteNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const parseTransform = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

export const normalizeCoverPhotoTransform = (value) => {
    const raw = parseTransform(value);
    return {
        x: roundToPrecision(clamp(
            toFiniteNumber(raw.x ?? raw.positionX ?? raw.position_x, COVER_PHOTO_TRANSFORM_DEFAULT.x),
            COVER_PHOTO_TRANSFORM_MIN_POSITION,
            COVER_PHOTO_TRANSFORM_MAX_POSITION
        )),
        y: roundToPrecision(clamp(
            toFiniteNumber(raw.y ?? raw.positionY ?? raw.position_y, COVER_PHOTO_TRANSFORM_DEFAULT.y),
            COVER_PHOTO_TRANSFORM_MIN_POSITION,
            COVER_PHOTO_TRANSFORM_MAX_POSITION
        )),
        scale: roundToPrecision(clamp(
            toFiniteNumber(raw.scale ?? raw.zoom, COVER_PHOTO_TRANSFORM_DEFAULT.scale),
            COVER_PHOTO_TRANSFORM_MIN_SCALE,
            COVER_PHOTO_TRANSFORM_MAX_SCALE
        ))
    };
};

export const getCoverPhotoImageStyle = (value) => {
    const { x, y, scale } = normalizeCoverPhotoTransform(value);
    return {
        objectPosition: `${50 - (x / 2)}% ${50 - (y / 2)}%`,
        transform: `scale(${scale})`,
        transformOrigin: 'center center'
    };
};

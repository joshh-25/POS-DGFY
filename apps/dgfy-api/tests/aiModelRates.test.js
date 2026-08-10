import { jest } from '@jest/globals';

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../src/config/logger.js', () => ({ default: mockLogger }));

let resolveModelRate;
let resolveImageModelRate;
let MODEL_RATES;
let DEFAULT_MODEL_RATE;
let IMAGE_MODEL_RATES;
let DEFAULT_IMAGE_MODEL_RATE;

beforeAll(async () => {
    const mod = await import('../src/config/aiModelRates.js');
    ({
        resolveModelRate,
        resolveImageModelRate,
        MODEL_RATES,
        DEFAULT_MODEL_RATE,
        IMAGE_MODEL_RATES,
        DEFAULT_IMAGE_MODEL_RATE
    } = mod);
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('resolveModelRate', () => {
    it('returns the exact per-token rate for a known model, marked not estimated', () => {
        const rate = resolveModelRate('gpt-5-mini');
        expect(rate.input).toBe(MODEL_RATES['gpt-5-mini'].input);
        expect(rate.output).toBe(MODEL_RATES['gpt-5-mini'].output);
        expect(rate.estimated).toBe(false);
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('falls back to the gpt-4o rate for an unknown model, flags it estimated, and warns once', () => {
        const first = resolveModelRate('some-future-model');
        expect(first.input).toBe(DEFAULT_MODEL_RATE.input);
        expect(first.output).toBe(DEFAULT_MODEL_RATE.output);
        expect(first.estimated).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);

        // A second call for the same unseen model should not warn again.
        resolveModelRate('some-future-model');
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });
});

describe('resolveImageModelRate', () => {
    it('returns the exact per-image rate for a known model/size, marked not estimated', () => {
        const rate = resolveImageModelRate('gpt-image-2', '2K');
        expect(rate.usd).toBe(IMAGE_MODEL_RATES['gpt-image-2']['2K']);
        expect(rate.estimated).toBe(false);
    });

    it('defaults to the 1K tier when size is omitted', () => {
        const rate = resolveImageModelRate('gpt-image-2');
        expect(rate.usd).toBe(IMAGE_MODEL_RATES['gpt-image-2']['1K']);
        expect(rate.estimated).toBe(false);
    });

    it('falls back to the default image rate for an unpriced model, flags it estimated, and warns once', () => {
        const first = resolveImageModelRate('some-future-image-model', '4K');
        expect(first.usd).toBe(DEFAULT_IMAGE_MODEL_RATE['1K']);
        expect(first.estimated).toBe(true);
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);

        resolveImageModelRate('some-future-image-model', '4K');
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('falls back to the default image rate for an unpriced size on a known model', () => {
        const rate = resolveImageModelRate('gpt-image-2', '8K');
        expect(rate.usd).toBe(DEFAULT_IMAGE_MODEL_RATE['1K']);
        expect(rate.estimated).toBe(true);
    });
});

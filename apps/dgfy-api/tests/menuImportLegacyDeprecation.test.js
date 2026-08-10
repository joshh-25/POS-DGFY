import { jest } from '@jest/globals';

const mockLoggerWarn = jest.fn();

jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: {
        warn: mockLoggerWarn,
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        http: jest.fn()
    }
}));

const { markLegacyMenuImportDeprecated } = await import('../src/middleware/menuImportDeprecation.js');
const {
    isMenuImportLegacySingleFileEnabled,
    menuImportLegacySunsetHttpDate,
    MENU_IMPORT_LEGACY_SUCCESSOR_PATH
} = await import('../src/config/menuImportFeature.js');

const makeRes = () => {
    const res = { headers: {} };
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.set = jest.fn((key, value) => {
        res.headers[key] = value;
        return res;
    });
    return res;
};

const makeReq = () => ({
    originalUrl: '/api/v1/items/import/pdf/preview',
    user: { tenant_id: 'tenant-1', user_id: 42 }
});

describe('single-file menu import deprecation', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        mockLoggerWarn.mockClear();
        delete process.env.MENU_IMPORT_LEGACY_SINGLE_FILE_ENABLED;
        delete process.env.MENU_IMPORT_LEGACY_SUNSET_DATE;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('stays enabled by default — the legacy path must not disappear on upgrade', () => {
        expect(isMenuImportLegacySingleFileEnabled()).toBe(true);

        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();

        markLegacyMenuImportDeprecated(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('announces the deprecation and points at the successor endpoint', () => {
        const res = makeRes();
        markLegacyMenuImportDeprecated(makeReq(), res, jest.fn());

        expect(res.headers.Deprecation).toBe('true');
        expect(res.headers.Link).toBe(`<${MENU_IMPORT_LEGACY_SUCCESSOR_PATH}>; rel="successor-version"`);
    });

    it('logs each call with its tenant so removal can be driven by real usage', () => {
        markLegacyMenuImportDeprecated(makeReq(), makeRes(), jest.fn());

        expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
        const [message, context] = mockLoggerWarn.mock.calls[0];
        expect(message).toMatch(/Deprecated single-file menu import/);
        expect(context).toMatchObject({
            tenant_id: 'tenant-1',
            user_id: 42,
            path: '/api/v1/items/import/pdf/preview'
        });
    });

    it('emits a Sunset header only when a parseable retirement date is configured', () => {
        process.env.MENU_IMPORT_LEGACY_SUNSET_DATE = '2026-12-31T00:00:00Z';
        const withDate = makeRes();
        markLegacyMenuImportDeprecated(makeReq(), withDate, jest.fn());
        expect(withDate.headers.Sunset).toBe(new Date('2026-12-31T00:00:00Z').toUTCString());

        process.env.MENU_IMPORT_LEGACY_SUNSET_DATE = 'sometime next year';
        const withGarbage = makeRes();
        markLegacyMenuImportDeprecated(makeReq(), withGarbage, jest.fn());
        expect(withGarbage.headers.Sunset).toBeUndefined();
        expect(menuImportLegacySunsetHttpDate()).toBeNull();

        delete process.env.MENU_IMPORT_LEGACY_SUNSET_DATE;
        const withoutDate = makeRes();
        markLegacyMenuImportDeprecated(makeReq(), withoutDate, jest.fn());
        expect(withoutDate.headers.Sunset).toBeUndefined();
    });

    it('answers 410 Gone naming the successor once the kill switch is flipped', () => {
        process.env.MENU_IMPORT_LEGACY_SINGLE_FILE_ENABLED = 'false';
        const res = makeRes();
        const next = jest.fn();

        markLegacyMenuImportDeprecated(makeReq(), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(410);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error_code: 'MENU_IMPORT_LEGACY_RETIRED',
            successor: MENU_IMPORT_LEGACY_SUCCESSOR_PATH
        }));
    });

    it('treats only the exact string "false" as off, so a typo cannot silently retire the path', () => {
        for (const value of ['true', 'FALSE', '0', 'no', '']) {
            process.env.MENU_IMPORT_LEGACY_SINGLE_FILE_ENABLED = value;
            expect(isMenuImportLegacySingleFileEnabled()).toBe(true);
        }
    });
});

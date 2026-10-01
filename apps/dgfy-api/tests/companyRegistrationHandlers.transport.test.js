import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDownloadAdminCompanyRegistrationUploadUseCase = jest.fn();
const mockSendUseCaseResult = jest.fn();
const noopUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/tenants/index.js', () => ({
    getCompanyRegistrationStatusUseCase: noopUseCase,
    resubmitCompanyRegistrationUseCase: noopUseCase,
    uploadCompanyRegistrationFileUseCase: noopUseCase,
    listAdminCompanyRegistrationUseCase: noopUseCase,
    downloadAdminCompanyRegistrationUploadUseCase: mockDownloadAdminCompanyRegistrationUploadUseCase,
    revokeAdminCompanyRegistrationUploadUseCase: noopUseCase
}));

jest.unstable_mockModule('../src/modules/shared/controllers/useCaseResponder.js', () => ({
    sendUseCaseResult: mockSendUseCaseResult
}));

let downloadAdminCompanyRegistrationUpload;

beforeAll(async () => {
    ({ downloadAdminCompanyRegistrationUpload } = await import('../src/modules/tenants/controllers/companyRegistrationHandlers.js'));
});

const createResponse = () => {
    const response = {
        headersSent: false,
        setHeader: jest.fn(),
        status: jest.fn(),
        json: jest.fn(),
        destroy: jest.fn()
    };
    response.status.mockReturnValue(response);
    return response;
};

describe('admin company registration upload transport', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('unwraps the stream metadata contract and pipes the private response', async () => {
        const stream = { on: jest.fn(), pipe: jest.fn(() => 'piped') };
        mockDownloadAdminCompanyRegistrationUploadUseCase.mockResolvedValue({
            success: true,
            data: {
                statusCode: 200,
                data: {
                    stream,
                    mimeType: 'image/png',
                    filename: 'menu.png',
                    size: 42
                }
            }
        });
        const response = createResponse();

        const result = await downloadAdminCompanyRegistrationUpload({ params: { id: 'tenant-1', uploadId: 'upload-1' }, admin: { id: 'admin-1' } }, response);

        expect(result).toBe('piped');
        expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
        expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '42');
        expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="menu.png"');
        expect(stream.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(stream.pipe).toHaveBeenCalledWith(response);
    });

    it('returns a readable error before headers are sent when the storage stream fails', async () => {
        let onError;
        const stream = {
            on: jest.fn((event, callback) => { if (event === 'error') onError = callback; }),
            pipe: jest.fn()
        };
        mockDownloadAdminCompanyRegistrationUploadUseCase.mockResolvedValue({
            success: true,
            data: { statusCode: 200, data: { stream, mimeType: 'image/png', filename: 'menu.png', size: 42 } }
        });
        const response = createResponse();

        await downloadAdminCompanyRegistrationUpload({ params: { id: 'tenant-1', uploadId: 'upload-1' }, admin: { id: 'admin-1' } }, response);
        onError(new Error('read failed'));

        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json).toHaveBeenCalledWith({ success: false, message: 'Registration upload could not be read.' });
        expect(response.destroy).not.toHaveBeenCalled();
    });

    it('destroys a response whose headers were already sent when the stream fails', async () => {
        let onError;
        const stream = {
            on: jest.fn((event, callback) => { if (event === 'error') onError = callback; }),
            pipe: jest.fn()
        };
        mockDownloadAdminCompanyRegistrationUploadUseCase.mockResolvedValue({
            success: true,
            data: { statusCode: 200, data: { stream, mimeType: 'image/png', filename: 'menu.png', size: 42 } }
        });
        const response = createResponse();

        await downloadAdminCompanyRegistrationUpload({ params: { id: 'tenant-1', uploadId: 'upload-1' }, admin: { id: 'admin-1' } }, response);
        response.headersSent = true;
        onError(new Error('read failed'));

        expect(response.destroy).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });
});

import {
    COMPANY_REGISTRATION_UPLOAD_MAX_BYTES,
    validateCompanyRegistrationUpload
} from '../src/modules/tenants/entities/companyRegistrationUploadValidation.js';

const file = (overrides = {}) => ({
    originalname: 'menu.csv',
    mimetype: 'text/csv',
    buffer: Buffer.from('name,price\nCoffee,100\n'),
    ...overrides
});

describe('company registration upload validation', () => {
    it('accepts a CSV menu and normalizes the original filename without using it as a storage path', () => {
        const result = validateCompanyRegistrationUpload({
            kind: 'menu',
            file: file({ originalname: '..\\..\\private\\menu.csv' })
        });

        expect(result.kind).toBe('menu');
        expect(result.extension).toBe('csv');
        expect(result.original_filename).toBe('menu.csv');
        expect(result.original_filename).not.toMatch(/[\\/]/);
        expect(result.sha256).toHaveLength(64);
    });

    it('requires a matching file signature for image and PDF uploads', () => {
        expect(() => validateCompanyRegistrationUpload({
            kind: 'cover',
            file: file({ originalname: 'cover.png', mimetype: 'image/png' })
        })).toThrow('signature');

        expect(() => validateCompanyRegistrationUpload({
            kind: 'menu',
            file: file({ originalname: 'menu.pdf', mimetype: 'application/pdf', buffer: Buffer.from('not a pdf') })
        })).toThrow('signature');

        expect(validateCompanyRegistrationUpload({
            kind: 'cover',
            file: file({ originalname: 'cover.png', mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]) })
        })).toEqual(expect.objectContaining({ kind: 'cover', extension: 'png' }));
    });

    it('allows menu PDFs but rejects PDFs in image-only fields and NUL-containing CSV data', () => {
        expect(validateCompanyRegistrationUpload({
            kind: 'menu',
            file: file({ originalname: 'menu.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n') })
        }).extension).toBe('pdf');

        expect(() => validateCompanyRegistrationUpload({
            kind: 'profile',
            file: file({ originalname: 'profile.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n') })
        })).toThrow('not supported');

        expect(() => validateCompanyRegistrationUpload({
            kind: 'menu',
            file: file({ buffer: Buffer.from('name,price\u0000\nCoffee,100') })
        })).toThrow('signature');
    });

    it('rejects files above the server-side size cap', () => {
        expect(() => validateCompanyRegistrationUpload({
            kind: 'menu',
            file: file({ buffer: Buffer.alloc(COMPANY_REGISTRATION_UPLOAD_MAX_BYTES + 1) })
        })).toThrow('10 MB');
    });
});

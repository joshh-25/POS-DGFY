import {
  REGISTRATION_MAX_GALLERY_UPLOADS,
  normalizeDraftPayload,
  validateRegistrationFileSignature,
  validateRegistrationSubmission
} from '../src/modules/tenants/contracts/companyRegistrationDraftContract.js';

describe('company registration draft contract', () => {
  const completePayload = () => ({
    business: {
      company_name: 'Example Store',
      industry_key: 'retail'
    },
    storefront: {
      delivery_partners: []
    },
    location: {
      address: '1 Main Street'
    },
    hours: {
      monday: { open: '09:00', close: '17:00' }
    }
  });

  it('keeps only supported draft sections and rejects prototype-pollution keys', () => {
    expect(normalizeDraftPayload({
      business: { company_name: 'Example Store' },
      unrelated: 'ignored'
    })).toEqual({
      business: { company_name: 'Example Store' }
    });

    expect(() => normalizeDraftPayload(JSON.parse('{"business":{"__proto__":{"polluted":true}}}')))
      .toThrow('unsupported field name');
  });

  it('validates required business, location, hours, partner, and upload rules', () => {
    expect(validateRegistrationSubmission({
      payload: completePayload(),
      uploads: []
    })).toEqual(expect.objectContaining({
      business: completePayload().business
    }));

    expect(() => validateRegistrationSubmission({
      payload: { business: completePayload().business },
      uploads: []
    })).toThrow('required');

    expect(() => validateRegistrationSubmission({
      payload: {
        ...completePayload(),
        storefront: { delivery_partners: ['one', 'two', 'three', 'four'] }
      },
      uploads: []
    })).toThrow('Complete the required');

    expect(() => validateRegistrationSubmission({
      payload: completePayload(),
      uploads: Array.from({ length: REGISTRATION_MAX_GALLERY_UPLOADS + 1 }, (_, index) => ({
        id: 'upload-' + index,
        category: 'gallery_image',
        upload_status: 'ready_for_review',
        validation_status: 'passed',
        removed_at: null
      }))
    })).toThrow('Complete the required');
  });

  it('accepts the canonical industry without requiring the legacy broad business type', () => {
    const payload = completePayload();

    expect(payload.business).not.toHaveProperty('business_type');
    expect(validateRegistrationSubmission({ payload, uploads: [] }).business).toEqual(expect.objectContaining({
      company_name: 'Example Store',
      industry_key: 'retail'
    }));
  });

  it('requires file content to match the declared MIME type', () => {
    expect(validateRegistrationFileSignature({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimeType: 'image/png',
      category: 'profile_image'
    })).toBe(true);

    expect(validateRegistrationFileSignature({
      buffer: Buffer.from('%PDF-1.7'),
      mimeType: 'application/pdf',
      category: 'menu_upload'
    })).toBe(true);

    expect(validateRegistrationFileSignature({
      buffer: Buffer.from('name,price\nCoffee,100\n', 'utf8'),
      mimeType: 'text/csv',
      category: 'menu_upload'
    })).toBe(true);

    expect(() => validateRegistrationFileSignature({
      buffer: Buffer.from('not-a-png'),
      mimeType: 'image/png',
      category: 'profile_image'
    })).toThrow('does not match');
  });
});

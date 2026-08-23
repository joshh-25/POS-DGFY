import { describe, expect, it } from 'vitest';
import {
  formatCustomerIdentityDocumentDate,
  getCustomerIdentityDocument
} from './customerIdentityDocument.js';

describe('customer identity document model', () => {
  it('normalizes the uploaded front/back document contract and approved status', () => {
    const document = getCustomerIdentityDocument({
      me: {
        valid_id: {
          status: 'verified',
          front_url: '/uploads/id-front.png',
          back_url: '/uploads/id-back.png',
          id_type: "Driver's License",
          uploaded_at: '2026-08-11T10:24:00Z',
          expires_at: '2030-01-01T00:00:00Z'
        }
      }
    });

    expect(document).toMatchObject({
      frontUrl: '/uploads/id-front.png',
      backUrl: '/uploads/id-back.png',
      idType: "Driver's License",
      status: 'verified',
      isVerified: true,
      hasUploaded: true
    });
    expect(formatCustomerIdentityDocumentDate(document.uploadedAt)).toBe('Aug 11, 2026');
  });

  it('returns an empty document when no ID has been uploaded', () => {
    expect(getCustomerIdentityDocument({ me: {} })).toMatchObject({
      frontUrl: '',
      backUrl: '',
      hasUploaded: false,
      isVerified: false
    });
  });
});

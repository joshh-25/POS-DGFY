import { jest } from '@jest/globals';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';
import {
  buildCreateCompanyRegistrationDraftUseCase,
  buildSubmitCompanyRegistrationDraftUseCase,
  buildUpdateCompanyRegistrationDraftUseCase,
  buildUploadCompanyRegistrationFileUseCase
} from '../src/modules/tenants/usecases/companyRegistrationDraftUseCases.js';

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.test'
};

const draft = (overrides = {}) => ({
  id: '22222222-2222-4222-8222-222222222222',
  status: 'draft',
  current_step: 1,
  optimistic_version: 1,
  draft_payload: {},
  registration_email_snapshot: account.email,
  uploads: [],
  createdAt: new Date('2026-09-26T00:00:00.000Z'),
  updatedAt: new Date('2026-09-26T00:00:00.000Z'),
  ...overrides
});

const completePayload = {
  business: {
    business_type: 'retail',
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
};

describe('company registration draft use cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a landlord-side draft without creating a tenant', async () => {
    const repository = {
      findLatestEditable: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(draft())
    };
    const useCase = buildCreateCompanyRegistrationDraftUseCase({
      repository,
      idGenerator: () => '33333333-3333-4333-8333-333333333333'
    });

    const result = await useCase({ dgfyAccount: account });

    expect(result.success).toBe(true);
    expect(result.data.payload.data).toEqual(expect.objectContaining({
      id: draft().id,
      status: 'draft'
    }));
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      dgfyAccountId: account.id,
      registrationEmail: account.email
    }));
  });

  it('updates only supported draft data and uses optimistic versioning', async () => {
    const updated = draft({
      current_step: 2,
      optimistic_version: 2,
      draft_payload: { business: { company_name: 'Example Store' } }
    });
    const repository = {
      findOwned: jest.fn().mockResolvedValue(draft({
        draft_payload: { business: { business_type: 'retail' } }
      })),
      updateDraft: jest.fn().mockResolvedValue(updated)
    };
    const useCase = buildUpdateCompanyRegistrationDraftUseCase({ repository });

    const result = await useCase({
      draftId: draft().id,
      dgfyAccount: account,
      body: {
        version: 1,
        current_step: 2,
        payload: {
          business: { company_name: 'Example Store' },
          storefront: { tagline: 'Fresh every day' },
          ignored: 'must not persist'
        }
      }
    });

    expect(result.success).toBe(true);
    expect(repository.updateDraft).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 1,
      currentStep: 2,
      draftPayload: {
        business: { business_type: 'retail', company_name: 'Example Store' },
        storefront: { tagline: 'Fresh every day' }
      }
    }));
  });

  it('rejects submission unless both separate legal consents are accepted', async () => {
    const repository = {
      transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
      findOwnedForUpdate: jest.fn().mockResolvedValue(draft({
        current_step: 3,
        draft_payload: completePayload
      })),
      listActiveUploads: jest.fn().mockResolvedValue([]),
      submitDraft: jest.fn()
    };
    const useCase = buildSubmitCompanyRegistrationDraftUseCase({
      repository,
      now: () => new Date('2026-09-26T02:00:00.000Z')
    });

    const result = await useCase({
      draftId: draft().id,
      dgfyAccount: account,
      body: {
        version: 1,
        accepted_company_terms: true,
        accepted_marketplace_terms: false,
        company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
        marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.details).toEqual(expect.objectContaining({
      field: 'accepted_marketplace_terms'
    }));
    expect(repository.submitDraft).not.toHaveBeenCalled();
  });

  it('submits an immutable snapshot with legal evidence and upload metadata', async () => {
    const submitted = draft({
      status: 'pending_review',
      current_step: 3,
      optimistic_version: 2,
      draft_payload: completePayload,
      submitted_at: new Date('2026-09-26T02:00:00.000Z')
    });
    const repository = {
      transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
      findOwnedForUpdate: jest.fn().mockResolvedValue(draft({
        current_step: 3,
        draft_payload: completePayload
      })),
      listActiveUploads: jest.fn().mockResolvedValue([{
        id: '44444444-4444-4444-8444-444444444444',
        category: 'menu_upload',
        original_name: 'menu.csv',
        sanitized_name: 'menu.csv',
        mime_type: 'text/csv',
        file_size: 42,
        storage_key: 'draft/upload.csv',
        sha256: 'a'.repeat(64),
        upload_status: 'ready_for_review',
        validation_status: 'passed',
        extraction_status: 'pending',
        position: 0
      }]),
      submitDraft: jest.fn().mockResolvedValue(submitted)
    };
    const useCase = buildSubmitCompanyRegistrationDraftUseCase({
      repository,
      now: () => new Date('2026-09-26T02:00:00.000Z')
    });

    const result = await useCase({
      draftId: draft().id,
      dgfyAccount: account,
      body: {
        version: 1,
        accepted_company_terms: true,
        accepted_marketplace_terms: true,
        company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
        marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
      },
      metadata: {
        ip_address: '127.0.0.1',
        user_agent: 'jest',
        request_id: 'request-1'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.payload.data).toEqual(expect.objectContaining({
      registration_id: submitted.id,
      status: 'pending_review'
    }));
    expect(repository.submitDraft).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: 3,
      legalTermsSnapshot: expect.objectContaining({
        accepted_company_terms: true,
        accepted_marketplace_terms: true,
        dgfy_account_id: account.id,
        ip_address: '127.0.0.1'
      }),
      submissionSnapshot: expect.objectContaining({
        dgfy_account_id: account.id,
        uploads: [expect.objectContaining({
          storage_key: 'draft/upload.csv',
          sha256: 'a'.repeat(64)
        })]
      })
    }));
  });

  it('persists a validated upload through the private storage adapter', async () => {
    const repository = {
      findOwned: jest.fn().mockResolvedValue(draft()),
      createUpload: jest.fn().mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
        category: 'profile_image',
        original_name: 'logo.png',
        sanitized_name: 'logo.png',
        mime_type: 'image/png',
        file_size: 8,
        upload_status: 'ready_for_review',
        validation_status: 'passed',
        extraction_status: 'not_applicable',
        position: 0
      })
    };
    const storage = {
      persist: jest.fn().mockResolvedValue({
        storageKey: draft().id + '/55555555-5555-4555-8555-555555555555.png',
        sanitizedName: 'logo.png',
        sha256: 'b'.repeat(64),
        fileSize: 8
      }),
      remove: jest.fn()
    };
    const useCase = buildUploadCompanyRegistrationFileUseCase({
      repository,
      storage,
      idGenerator: () => '55555555-5555-4555-8555-555555555555'
    });

    const result = await useCase({
      draftId: draft().id,
      dgfyAccount: account,
      body: { category: 'profile_image' },
      file: {
        originalname: 'logo.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      }
    });

    expect(result.success).toBe(true);
    expect(storage.persist).toHaveBeenCalled();
    expect(repository.createUpload).toHaveBeenCalledWith(expect.objectContaining({
      category: 'profile_image',
      storageKey: draft().id + '/55555555-5555-4555-8555-555555555555.png',
      extractionStatus: 'not_applicable'
    }));
  });
});

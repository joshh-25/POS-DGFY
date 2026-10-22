import { jest } from '@jest/globals';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';
import {
  buildCreateCompanyRegistrationDraftUseCase,
  buildSubmitCompanyRegistrationDraftUseCase,
  buildUpdateCompanyRegistrationDraftUseCase,
  buildUploadCompanyRegistrationFileUseCase,
  buildRemoveCompanyRegistrationFileUseCase
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
    const savedPayload = {
      business: {
        company_name: 'Example Store',
        industry_key: 'retail',
        industry_tag: 'Neighborhood cafe'
      },
      storefront: {
        store_email: 'hello@example.test',
        tagline: 'Fresh every day'
      }
    };
    const updated = draft({
      current_step: 2,
      optimistic_version: 2,
      draft_payload: savedPayload
    });
    const repository = {
      findOwned: jest.fn().mockResolvedValue(draft({
        draft_payload: {
          business: {
            company_name: 'Example Store',
            industry_key: 'retail',
            industry_tag: 'Neighborhood cafe'
          },
          storefront: { store_email: 'hello@example.test' }
        }
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
        business: {
          company_name: 'Example Store',
          industry_key: 'retail',
          industry_tag: 'Neighborhood cafe'
        },
        storefront: {
          store_email: 'hello@example.test',
          tagline: 'Fresh every day'
        }
      }
    }));
    expect(result.data.payload.data.payload).toEqual(savedPayload);
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
    const submittedPayload = repository.submitDraft.mock.calls[0][0].submissionSnapshot.payload;
    expect(submittedPayload.business).toEqual(expect.objectContaining({
      company_name: 'Example Store',
      industry_key: 'retail'
    }));
    expect(submittedPayload.business).not.toHaveProperty('business_type');
  });

  it('auto-approves a valid submission and returns the provisioned POS handoff references', async () => {
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
      listActiveUploads: jest.fn().mockResolvedValue([]),
      submitDraft: jest.fn().mockResolvedValue(submitted)
    };
    const autoApproveCompanyRegistrationDraft = jest.fn().mockResolvedValue({
      success: true,
      data: {
        statusCode: 202,
        payload: {
          data: {
            draft_id: submitted.id,
            tenant_id: '66666666-6666-4666-8666-666666666666',
            application_id: '77777777-7777-4777-8777-777777777777',
            materialization_status: 'in_progress'
          }
        }
      }
    });
    const useCase = buildSubmitCompanyRegistrationDraftUseCase({
      repository,
      autoApproveCompanyRegistrationDraft,
      shouldAutoApprove: () => true,
      now: () => new Date('2026-09-26T02:00:00.000Z')
    });

    const result = await useCase({
      draftId: submitted.id,
      dgfyAccount: account,
      body: {
        version: 1,
        accepted_company_terms: true,
        accepted_marketplace_terms: true,
        company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
        marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.payload.data).toEqual(expect.objectContaining({
      registration_id: submitted.id,
      application_id: '77777777-7777-4777-8777-777777777777',
      tenant_id: '66666666-6666-4666-8666-666666666666',
      status: 'setting_up_company',
      review_status: 'approved',
      provisioning_status: 'in_progress',
      registration_access_mode: 'catalog_only'
    }));
    expect(autoApproveCompanyRegistrationDraft).toHaveBeenCalledWith({
      draftId: submitted.id,
      actor: { actor_type: 'system', source: 'public_registration' }
    });
    expect(result.data.payload.message).toMatch(/approved automatically/i);
  });

  it('persists a validated upload through the private storage adapter', async () => {
    const savedUpload = {
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
    };
    const repository = {
      findOwned: jest.fn().mockResolvedValue(draft()),
      findOwnedForUpdate: jest.fn().mockResolvedValue(draft()),
      listActiveUploads: jest.fn().mockResolvedValue([]),
      transaction: jest.fn((callback) => callback('transaction')),
      createUpload: jest.fn().mockResolvedValue(savedUpload)
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
      extractionStatus: 'not_applicable',
      transaction: 'transaction'
    }));
  });

  it('logs private storage failures with stage and safe upload metadata while keeping the response generic', async () => {
    const logger = { error: jest.fn() };
    const repository = { findOwned: jest.fn().mockResolvedValue(draft()) };
    const storage = {
      persist: jest.fn().mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'EACCES', errno: -13, syscall: 'open' })),
      remove: jest.fn()
    };
    const useCase = buildUploadCompanyRegistrationFileUseCase({ repository, storage, logger });

    const result = await useCase({
      draftId: draft().id,
      dgfyAccount: account,
      body: { category: 'profile_image' },
      file: { originalname: 'logo.png', mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Unable to save the registration file.');
    expect(logger.error).toHaveBeenCalledWith('[RegistrationDraft] Failed to upload file', expect.objectContaining({
      stage: 'persist', code: 'EACCES', category: 'profile_image', mimeType: 'image/png', fileSize: 8, draftId: draft().id
    }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('logo.png');
  });

  it('logs landlord insert failures and removes the orphaned file', async () => {
    const logger = { error: jest.fn() };
    const storedFile = { storageKey: draft().id + '/55555555-5555-4555-8555-555555555555.png', sanitizedName: 'logo.png', sha256: 'c'.repeat(64), fileSize: 8 };
    const repository = {
      findOwned: jest.fn().mockResolvedValue(draft()),
      findOwnedForUpdate: jest.fn().mockResolvedValue(draft()),
      listActiveUploads: jest.fn().mockResolvedValue([]),
      transaction: jest.fn((callback) => callback('tx')),
      createUpload: jest.fn().mockRejectedValue(Object.assign(new Error('insert failed'), {
        name: 'SequelizeDatabaseError',
        original: { code: 'ER_BAD_FIELD_ERROR', sqlMessage: 'Unknown column' }
      }))
    };
    const storage = { persist: jest.fn().mockResolvedValue(storedFile), remove: jest.fn().mockResolvedValue(undefined) };
    const useCase = buildUploadCompanyRegistrationFileUseCase({ repository, storage, logger });

    const result = await useCase({
      draftId: draft().id,
      dgfyAccount: account,
      body: { category: 'profile_image' },
      file: { originalname: 'logo.png', mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Unable to save the registration file.');
    expect(storage.remove).toHaveBeenCalledWith(storedFile.storageKey);
    expect(logger.error).toHaveBeenCalledWith('[RegistrationDraft] Failed to upload file', expect.objectContaining({
      stage: 'db_insert', code: 'ER_BAD_FIELD_ERROR', category: 'profile_image', mimeType: 'image/png', fileSize: 8, draftId: draft().id
    }));
  });

  it('replaces a staged image inside one transaction, retaining the old image unless the new row is saved', async () => {
    const previousUpload = {
      id: '44444444-4444-4444-8444-444444444444',
      category: 'profile_image',
      upload_status: 'ready_for_review',
      removed_at: null
    };
    const savedUpload = {
      id: '55555555-5555-4555-8555-555555555555',
      category: 'profile_image',
      original_name: 'new-logo.png',
      sanitized_name: 'new-logo.png',
      mime_type: 'image/png',
      file_size: 8,
      upload_status: 'ready_for_review',
      validation_status: 'passed',
      extraction_status: 'not_applicable',
      position: 0
    };
    const repository = {
      findOwned: jest.fn().mockResolvedValue(draft({ uploads: [previousUpload] })),
      findOwnedForUpdate: jest.fn().mockResolvedValue(draft()),
      listActiveUploads: jest.fn().mockResolvedValue([previousUpload]),
      findOwnedUpload: jest.fn().mockResolvedValue(previousUpload),
      removeUpload: jest.fn().mockResolvedValue(true),
      transaction: jest.fn((callback) => callback('replacement-transaction')),
      createUpload: jest.fn().mockResolvedValue(savedUpload)
    };
    const storage = {
      persist: jest.fn().mockResolvedValue({
        storageKey: draft().id + '/55555555-5555-4555-8555-555555555555.png',
        sanitizedName: 'new-logo.png',
        sha256: 'c'.repeat(64),
        fileSize: 8
      }),
      remove: jest.fn().mockResolvedValue(undefined)
    };
    const useCase = buildUploadCompanyRegistrationFileUseCase({
      repository,
      storage,
      idGenerator: () => savedUpload.id,
      now: () => new Date('2026-10-10T00:00:00.000Z')
    });

    const result = await useCase({
      draftId: draft().id,
      dgfyAccount: account,
      body: { category: 'profile_image', replace_upload_id: previousUpload.id },
      file: {
        originalname: 'new-logo.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      }
    });

    expect(result.success).toBe(true);
    expect(repository.transaction).toHaveBeenCalledTimes(1);
    expect(repository.removeUpload).toHaveBeenCalledWith(expect.objectContaining({
      uploadId: previousUpload.id,
      transaction: 'replacement-transaction'
    }));
    expect(repository.createUpload).toHaveBeenCalledWith(expect.objectContaining({
      id: savedUpload.id,
      transaction: 'replacement-transaction'
    }));
    expect(repository.removeUpload.mock.invocationCallOrder[0]).toBeLessThan(repository.createUpload.mock.invocationCallOrder[0]);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('cleans up the new image file when the atomic replacement transaction fails', async () => {
    const previousUpload = {
      id: '44444444-4444-4444-8444-444444444444',
      category: 'cover_image',
      upload_status: 'ready_for_review',
      removed_at: null
    };
    let activeUploads = [previousUpload];
    const storedFile = {
      storageKey: draft().id + '/55555555-5555-4555-8555-555555555555.png',
      sanitizedName: 'new-cover.png',
      sha256: 'd'.repeat(64),
      fileSize: 8
    };
    const repository = {
      findOwned: jest.fn().mockResolvedValue(draft({ uploads: [previousUpload] })),
      findOwnedForUpdate: jest.fn().mockResolvedValue(draft()),
      listActiveUploads: jest.fn().mockImplementation(async () => activeUploads),
      findOwnedUpload: jest.fn().mockImplementation(async (uploadId) => activeUploads.find((upload) => upload.id === uploadId)),
      removeUpload: jest.fn().mockImplementation(async ({ uploadId }) => {
        activeUploads = activeUploads.filter((upload) => upload.id !== uploadId);
        return true;
      }),
      transaction: jest.fn(async (callback) => {
        const beforeTransaction = activeUploads;
        try {
          return await callback('replacement-transaction');
        } catch (error) {
          activeUploads = beforeTransaction;
          throw error;
        }
      }),
      createUpload: jest.fn().mockRejectedValue(new Error('Database unavailable'))
    };
    const storage = {
      persist: jest.fn().mockResolvedValue(storedFile),
      remove: jest.fn().mockResolvedValue(undefined)
    };
    const useCase = buildUploadCompanyRegistrationFileUseCase({
      repository,
      storage,
      idGenerator: () => '55555555-5555-4555-8555-555555555555'
    });

    const result = await useCase({
      draftId: draft().id,
      dgfyAccount: account,
      body: { category: 'cover_image', replace_upload_id: previousUpload.id },
      file: {
        originalname: 'new-cover.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      }
    });

    expect(result.success).toBe(false);
    expect(repository.removeUpload).toHaveBeenCalled();
    expect(activeUploads).toEqual([previousUpload]);
    expect(storage.remove).toHaveBeenCalledWith(storedFile.storageKey);
  });

  it('serializes upload removal with image replacement through the draft transaction', async () => {
    const upload = {
      id: '44444444-4444-4444-8444-444444444444',
      upload_status: 'ready_for_review',
      removed_at: null
    };
    const repository = {
      transaction: jest.fn((callback) => callback('remove-transaction')),
      findOwnedForUpdate: jest.fn().mockResolvedValue(draft()),
      findOwnedUpload: jest.fn().mockResolvedValue(upload),
      removeUpload: jest.fn().mockResolvedValue(true)
    };
    const removedAt = new Date('2026-10-10T00:00:00.000Z');
    const useCase = buildRemoveCompanyRegistrationFileUseCase({ repository, now: () => removedAt });

    const result = await useCase({
      draftId: draft().id,
      uploadId: upload.id,
      dgfyAccount: account
    });

    expect(result.success).toBe(true);
    expect(repository.findOwnedForUpdate).toHaveBeenCalledWith(draft().id, account.id, 'remove-transaction');
    expect(repository.removeUpload).toHaveBeenCalledWith(expect.objectContaining({
      uploadId: upload.id,
      removedAt,
      transaction: 'remove-transaction'
    }));
  });
});

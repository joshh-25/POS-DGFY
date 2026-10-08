import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';
import { describe, expect, it, jest } from '@jest/globals';
import { buildCompanyRegistrationUploadReviewUseCases } from '../src/modules/tenants/usecases/companyRegistrationUploadReviewUseCases.js';

const draftId = '22222222-2222-4222-8222-222222222222';
const tenantId = '33333333-3333-4333-8333-333333333333';
const uploadOneId = '44444444-4444-4444-8444-444444444444';
const uploadTwoId = '55555555-5555-4555-8555-555555555555';

const buildUpload = (overrides = {}) => ({
  id: uploadOneId,
  registration_draft_id: draftId,
  category: 'menu_upload',
  original_name: '../Menu One.csv',
  sanitized_name: 'Menu One.csv',
  mime_type: 'text/csv',
  file_size: 8,
  storage_key: `${draftId}/${uploadOneId}.csv`,
  sha256: 'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f',
  upload_status: 'ready_for_review',
  validation_status: 'passed',
  extraction_status: 'pending',
  position: 0,
  uploaded_at: '2026-09-26T00:00:00.000Z',
  ...overrides
});

const buildDraft = (overrides = {}) => ({
  id: draftId,
  status: 'pending_review',
  registration_email_snapshot: 'owner@example.test',
  draft_payload: { business: { company_name: 'Example Cafe' } },
  legal_terms_snapshot: { accepted_company_terms: true, accepted_marketplace_terms: true },
  materialization_status: 'not_started',
  materialized_tenant_id: null,
  uploads: [buildUpload()],
  ...overrides
});

const listZipEntries = (buffer) => new Promise((resolve, reject) => {
  yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipFile) => {
    if (error) return reject(error);
    const entries = [];
    zipFile.readEntry();
    zipFile.on('entry', (entry) => {
      entries.push(entry.fileName);
      zipFile.readEntry();
    });
    zipFile.on('end', () => resolve(entries));
    zipFile.on('error', reject);
  });
});

describe('company registration upload review', () => {
  it('lists safe metadata without exposing storage keys or removed files', async () => {
    const draft = buildDraft({ uploads: [buildUpload(), buildUpload({ id: uploadTwoId, upload_status: 'removed', removed_at: '2026-09-26T01:00:00.000Z' })] });
    const repository = {
      listForAdmin: jest.fn().mockResolvedValue([draft])
    };
    const useCases = buildCompanyRegistrationUploadReviewUseCases({
      repository,
      tenantAdminRepository: {},
      companyRegistrationRepository: {},
      companyRegistrationDownloadAuditRepository: {},
      storage: {},
      logger: {}
    });

    const result = await useCases.listDrafts({ status: 'pending_review' });

    expect(result.success).toBe(true);
    expect(result.data.payload.data[0]).toEqual(expect.objectContaining({
      id: draftId,
      company_name: 'Example Cafe',
      uploads: [expect.objectContaining({ id: uploadOneId })]
    }));
    expect(result.data.payload.data[0].uploads[0]).not.toHaveProperty('storage_key');
  });

  it('downloads an integrity-checked file and records a pending-draft audit', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-registration-review-'));
    const upload = buildUpload();
    const filePath = path.join(root, 'menu.csv');
    await fs.writeFile(filePath, '12345678');
    const audit = { create: jest.fn().mockResolvedValue(undefined) };
    const repository = {
      findForAdmin: jest.fn().mockResolvedValue(buildDraft()),
      findAdminUpload: jest.fn().mockResolvedValue(upload)
    };
    const useCases = buildCompanyRegistrationUploadReviewUseCases({
      repository,
      tenantAdminRepository: {},
      companyRegistrationRepository: {},
      companyRegistrationDownloadAuditRepository: audit,
      storage: { pathForKey: jest.fn().mockReturnValue(filePath) },
      logger: {}
    });

    const result = await useCases.downloadUpload({
      draftId,
      uploadId: uploadOneId,
      actor: { id: 'admin-1', username: 'reviewer' },
      requestMetadata: { request_id: 'req-1' }
    });

    expect(result.success).toBe(true);
    expect(result.data.file.buffer.toString()).toBe('12345678');
    expect(result.data.file.filename).toBe('Menu One.csv');
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({
      registration_draft_id: draftId,
      action: 'individual_download',
      actor_username: 'reviewer',
      upload_id: uploadOneId
    }));
    await fs.rm(root, { recursive: true, force: true });
  });

  it('creates a menu-only ZIP with a manifest and audits every included original', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-registration-archive-'));
    const first = buildUpload();
    const second = buildUpload({
      id: uploadTwoId,
      original_name: 'Menu Two.pdf',
      sanitized_name: 'Menu Two.pdf',
      mime_type: 'application/pdf',
      file_size: 8,
      storage_key: `${draftId}/${uploadTwoId}.pdf`,
      sha256: '9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab',
      position: 1
    });
    const files = new Map([
      [first.storage_key, '12345678'],
      [second.storage_key, 'abcdefgh']
    ]);
    const paths = new Map();
    for (const [key, contents] of files.entries()) {
      const filePath = path.join(root, path.basename(key));
      await fs.writeFile(filePath, contents);
      paths.set(key, filePath);
    }
    const audit = { create: jest.fn().mockResolvedValue(undefined) };
    const repository = {
      findForAdmin: jest.fn().mockResolvedValue(buildDraft({ uploads: [first, second] })),
      listAdminUploads: jest.fn().mockResolvedValue([first, second])
    };
    const useCases = buildCompanyRegistrationUploadReviewUseCases({
      repository,
      tenantAdminRepository: {},
      companyRegistrationRepository: {},
      companyRegistrationDownloadAuditRepository: audit,
      storage: { pathForKey: jest.fn((key) => paths.get(key)) },
      logger: {}
    });

    const result = await useCases.downloadMenuArchive({
      draftId,
      actor: { id: 'admin-1', username: 'reviewer' }
    });

    expect(result.success).toBe(true);
    await expect(listZipEntries(result.data.file.buffer)).resolves.toEqual([
      'menu/01-Menu One.csv',
      'menu/02-Menu Two.pdf',
      'manifest.json'
    ]);
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'archive_download',
      file_count: 2,
      metadata: expect.objectContaining({ upload_ids: [uploadOneId, uploadTwoId] })
    }));
    await fs.rm(root, { recursive: true, force: true });
  });
});

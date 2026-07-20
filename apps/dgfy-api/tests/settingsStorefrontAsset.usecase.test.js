import { jest } from '@jest/globals';
import {
  buildDeleteStorefrontAssetUseCase,
  buildUploadStorefrontAssetUseCase
} from '../src/modules/settings/usecases/manageStorefrontAssetUseCase.js';

describe('settings storefront asset use-cases', () => {
  it('upload use-case stores file and persists setting keys', async () => {
    const imageFileValidator = jest.fn().mockResolvedValue({ ok: true, detectedMime: 'image/png' });
    const settingsRepository = {
      getSettingsByKeys: jest.fn().mockResolvedValue({
        storefront_cover_image_path: { value: 'storefront-assets/t-1/old-cover.png' }
      }),
      updateSettings: jest.fn().mockResolvedValue({ updated: 2 })
    };
    const storefrontAssetStorage = {
      remove: jest.fn().mockResolvedValue(undefined),
      store: jest.fn().mockResolvedValue({
        path: 'storefront-assets/t-1/cover-1.png',
        url: '/uploads/storefront-assets/t-1/cover-1.png'
      })
    };
    const useCase = buildUploadStorefrontAssetUseCase({ settingsRepository, storefrontAssetStorage, imageFileValidator });

    const result = await useCase({
      assetType: 'cover',
      file: {
        mimetype: 'image/png',
        originalname: 'cover.png',
        path: '/tmp/cover.png'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      asset_type: 'cover',
      image_url: '/uploads/storefront-assets/t-1/cover-1.png',
      path: 'storefront-assets/t-1/cover-1.png'
    });
    expect(storefrontAssetStorage.remove).toHaveBeenCalledWith({ path: 'storefront-assets/t-1/old-cover.png' });
    expect(settingsRepository.updateSettings).toHaveBeenCalledWith({
      storefront_cover_image_path: 'storefront-assets/t-1/cover-1.png',
      storefront_cover_image_url: '/uploads/storefront-assets/t-1/cover-1.png'
    });
    expect(storefrontAssetStorage.store.mock.invocationCallOrder[0]).toBeLessThan(
      settingsRepository.updateSettings.mock.invocationCallOrder[0]
    );
    expect(settingsRepository.updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      storefrontAssetStorage.remove.mock.invocationCallOrder[0]
    );
  });

  it('gallery upload stores file without mutating persisted gallery settings', async () => {
    const imageFileValidator = jest.fn().mockResolvedValue({ ok: true, detectedMime: 'image/png' });
    const settingsRepository = {
      getSettingsByKeys: jest.fn(),
      updateSettings: jest.fn()
    };
    const storefrontAssetStorage = {
      remove: jest.fn().mockResolvedValue(undefined),
      store: jest.fn().mockResolvedValue({
        path: 'storefront-assets/t-1/gallery-1.png',
        url: '/uploads/storefront-assets/t-1/gallery-1.png'
      })
    };
    const useCase = buildUploadStorefrontAssetUseCase({ settingsRepository, storefrontAssetStorage, imageFileValidator });

    const result = await useCase({
      assetType: 'gallery',
      file: {
        mimetype: 'image/png',
        originalname: 'gallery.png',
        path: '/tmp/gallery.png'
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      asset_type: 'gallery',
      image_url: '/uploads/storefront-assets/t-1/gallery-1.png',
      path: 'storefront-assets/t-1/gallery-1.png'
    });
    expect(settingsRepository.getSettingsByKeys).not.toHaveBeenCalled();
    expect(settingsRepository.updateSettings).not.toHaveBeenCalled();
    expect(storefrontAssetStorage.remove).not.toHaveBeenCalled();
  });

  it('upload use-case rejects non-image mime types', async () => {
    const imageFileValidator = jest.fn().mockResolvedValue({ ok: false, reason: 'unsupported_reported_mime' });
    const useCase = buildUploadStorefrontAssetUseCase({
      settingsRepository: {
        getSettingsByKeys: jest.fn(),
        updateSettings: jest.fn()
      },
      storefrontAssetStorage: {
        remove: jest.fn(),
        store: jest.fn()
      },
      imageFileValidator
    });

    const result = await useCase({
      assetType: 'profile',
      file: {
        mimetype: 'application/pdf',
        originalname: 'x.pdf',
        path: '/tmp/x.pdf'
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(result.error.statusCode).toBe(422);
    expect(result.error.message).toBe('Only PNG, JPEG, GIF, WebP, BMP, or AVIF images are allowed for storefront assets.');
  });

  it('upload use-case returns a clear message for oversized image files', async () => {
    const imageFileValidator = jest.fn().mockResolvedValue({ ok: false, reason: 'file_too_large' });
    const useCase = buildUploadStorefrontAssetUseCase({
      settingsRepository: {
        getSettingsByKeys: jest.fn(),
        updateSettings: jest.fn()
      },
      storefrontAssetStorage: {
        remove: jest.fn(),
        store: jest.fn()
      },
      imageFileValidator
    });

    const result = await useCase({
      assetType: 'gallery',
      file: {
        mimetype: 'image/png',
        originalname: 'large.png',
        path: '/tmp/large.png'
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(422);
    expect(result.error.message).toBe('Storefront images must be 5 MB or smaller.');
  });

  it('upload use-case returns a clear message for binary signature mismatches', async () => {
    const imageFileValidator = jest.fn().mockResolvedValue({ ok: false, reason: 'mime_signature_mismatch' });
    const useCase = buildUploadStorefrontAssetUseCase({
      settingsRepository: {
        getSettingsByKeys: jest.fn(),
        updateSettings: jest.fn()
      },
      storefrontAssetStorage: {
        remove: jest.fn(),
        store: jest.fn()
      },
      imageFileValidator
    });

    const result = await useCase({
      assetType: 'gallery',
      file: {
        mimetype: 'image/png',
        originalname: 'fake.png',
        path: '/tmp/fake.png'
      }
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(422);
    expect(result.error.message).toBe('The uploaded file does not match a supported image format.');
  });

  it('delete use-case clears persisted keys', async () => {
    const settingsRepository = {
      getSettingsByKeys: jest.fn().mockResolvedValue({
        storefront_profile_image_path: { value: 'storefront-assets/t-1/profile-1.png' }
      }),
      updateSettings: jest.fn().mockResolvedValue({ updated: 2 })
    };
    const storefrontAssetStorage = {
      remove: jest.fn().mockResolvedValue(undefined)
    };
    const useCase = buildDeleteStorefrontAssetUseCase({ settingsRepository, storefrontAssetStorage });

    const result = await useCase({ assetType: 'profile' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ asset_type: 'profile', deleted: true });
    expect(settingsRepository.updateSettings).toHaveBeenCalledWith({
      storefront_profile_image_path: '',
      storefront_profile_image_url: ''
    });
  });

  it('upload use-case removes new file when settings update fails', async () => {
    const imageFileValidator = jest.fn().mockResolvedValue({ ok: true, detectedMime: 'image/png' });
    const settingsRepository = {
      getSettingsByKeys: jest.fn().mockResolvedValue({}),
      updateSettings: jest.fn().mockRejectedValue(new Error('db write failed'))
    };
    const storefrontAssetStorage = {
      remove: jest.fn().mockResolvedValue(undefined),
      store: jest.fn().mockResolvedValue({
        path: 'storefront-assets/t-1/profile-2.png',
        url: '/uploads/storefront-assets/t-1/profile-2.png'
      })
    };
    const useCase = buildUploadStorefrontAssetUseCase({ settingsRepository, storefrontAssetStorage, imageFileValidator });

    const result = await useCase({
      assetType: 'profile',
      file: {
        mimetype: 'image/png',
        originalname: 'profile.png',
        path: '/tmp/profile.png'
      }
    });

    expect(result.success).toBe(false);
    expect(storefrontAssetStorage.remove).toHaveBeenCalledWith({ path: 'storefront-assets/t-1/profile-2.png' });
  });
});

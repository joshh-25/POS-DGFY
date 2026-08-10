import { jest } from '@jest/globals';
import { buildStorageAndGroupingToolRegistry } from '../src/modules/ai/usecases/toolHandlers/storageAndGroupingToolRegistry.js';

describe('storageAndGroupingToolRegistry', () => {
  it('routes file-management handlers to fileManagementService', async () => {
    const registry = buildStorageAndGroupingToolRegistry({
      fileManagementService: {
        listFiles: jest.fn().mockResolvedValue(['a.csv']),
        createFolder: jest.fn().mockResolvedValue({ ok: true }),
        moveFile: jest.fn().mockResolvedValue({ moved: true })
      },
      itemGroupingService: {}
    });

    const listResult = await registry.list_files({ args: { path: '/tmp' } });
    const createResult = await registry.create_folder({ args: { path: '/tmp/new' } });
    const moveResult = await registry.move_file({ args: { source: '/a', destination: '/b' } });

    expect(listResult).toEqual(['a.csv']);
    expect(createResult).toEqual({ ok: true });
    expect(moveResult).toEqual({ moved: true });
  });

  it('bulk_create_inventory_folders returns partial-success payload', async () => {
    const createFolder = jest
      .fn()
      .mockResolvedValueOnce({ folder_id: 11 })
      .mockRejectedValueOnce(new Error('duplicate folder'));

    const registry = buildStorageAndGroupingToolRegistry({
      fileManagementService: {},
      itemGroupingService: { createFolder }
    });

    const result = await registry.bulk_create_inventory_folders({
      args: {
        folders: [
          { name: 'Raw Materials', description: 'RM' },
          { name: 'Raw Materials', description: 'duplicate' }
        ]
      }
    });

    expect(result).toEqual({
      success: false,
      total_requested: 2,
      created_count: 1,
      failed_count: 1,
      created: [{ name: 'Raw Materials', folder_id: 11, success: true }],
      failed: [{ name: 'Raw Materials', success: false, error: 'duplicate folder' }],
      message: 'Created 1 of 2 folders. 1 failed.'
    });
  });

  it('delete_inventory_folder throws when folder name does not exist', async () => {
    const registry = buildStorageAndGroupingToolRegistry({
      fileManagementService: {},
      itemGroupingService: {
        listFolders: jest.fn().mockResolvedValue([{ folder_id: 1, name: 'Seasonal' }]),
        deleteFolder: jest.fn()
      }
    });

    await expect(
      registry.delete_inventory_folder({ args: { folder_name: 'Missing Folder' } })
    ).rejects.toThrow('Folder "Missing Folder" not found');
  });
});


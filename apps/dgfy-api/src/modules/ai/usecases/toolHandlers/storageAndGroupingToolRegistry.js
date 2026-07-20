export const buildStorageAndGroupingToolRegistry = ({
    fileManagementService,
    itemGroupingService
}) => {
    const handlers = {
        list_files: async ({ args }) => fileManagementService.listFiles(args.path),
        create_folder: async ({ args }) => fileManagementService.createFolder(args.path),
        move_file: async ({ args }) => fileManagementService.moveFile(args.source, args.destination),

        get_inventory_folders: async () => itemGroupingService.listFolders(),
        create_inventory_folder: async ({ args }) => itemGroupingService.createFolder(args.name, args.description),
        move_items_to_inventory_folder: async ({ args }) => itemGroupingService.assignItemsToFolder(args.folder_name, args.item_ids),
        get_items_in_inventory_folder: async ({ args }) => itemGroupingService.getFolderDetails(args.folder_name),

        bulk_create_inventory_folders: async ({ args }) => {
            const created = [];
            const failed = [];

            for (const folder of args.folders) {
                try {
                    const folderResult = await itemGroupingService.createFolder(folder.name, folder.description || '');
                    created.push({
                        name: folder.name,
                        folder_id: folderResult.folder_id,
                        success: true
                    });
                } catch (error) {
                    failed.push({
                        name: folder.name,
                        success: false,
                        error: error.message
                    });
                }
            }

            return {
                success: failed.length === 0,
                total_requested: args.folders.length,
                created_count: created.length,
                failed_count: failed.length,
                created,
                failed,
                message: failed.length === 0
                    ? `Successfully created ${created.length} inventory folder(s)`
                    : `Created ${created.length} of ${args.folders.length} folders. ${failed.length} failed.`
            };
        },

        delete_inventory_folder: async ({ args }) => {
            const allFolders = await itemGroupingService.listFolders();
            const targetFolder = allFolders.find((folder) => folder.name.toLowerCase() === args.folder_name.toLowerCase());
            if (!targetFolder) {
                throw new Error(`Folder "${args.folder_name}" not found`);
            }

            const result = await itemGroupingService.deleteFolder(targetFolder.folder_id);
            result.folder_name = args.folder_name;
            return result;
        },

        bulk_delete_inventory_folders: async ({ args }) => {
            const folders = await itemGroupingService.listFolders();
            const deleted = [];
            const failedDeletes = [];

            for (const folderName of args.folder_names) {
                try {
                    const match = folders.find((folder) => folder.name.toLowerCase() === folderName.toLowerCase());
                    if (!match) {
                        failedDeletes.push({
                            name: folderName,
                            success: false,
                            error: `Folder "${folderName}" not found`
                        });
                        continue;
                    }

                    const deleteResult = await itemGroupingService.deleteFolder(match.folder_id);
                    deleted.push({
                        name: folderName,
                        folder_id: match.folder_id,
                        unassigned_count: deleteResult.unassigned_count,
                        success: true
                    });
                } catch (error) {
                    failedDeletes.push({
                        name: folderName,
                        success: false,
                        error: error.message
                    });
                }
            }

            return {
                success: failedDeletes.length === 0,
                total_requested: args.folder_names.length,
                deleted_count: deleted.length,
                failed_count: failedDeletes.length,
                deleted,
                failed: failedDeletes,
                message: failedDeletes.length === 0
                    ? `Successfully deleted ${deleted.length} inventory folder(s)`
                    : `Deleted ${deleted.length} of ${args.folder_names.length} folders. ${failedDeletes.length} failed.`
            };
        }
    };

    return handlers;
};


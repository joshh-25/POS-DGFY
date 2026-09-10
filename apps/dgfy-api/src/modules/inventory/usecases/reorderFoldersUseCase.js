export const buildReorderFoldersUseCase = ({ itemRepository }) => {
    return async ({ folderIds }) => itemRepository.reorderFolders(folderIds);
};

export const buildDeleteFolderUseCase = ({ itemRepository }) => {
    return async ({ folderId, replacementFolderId, userId }) => itemRepository.deleteFolder(folderId, replacementFolderId, userId);
};

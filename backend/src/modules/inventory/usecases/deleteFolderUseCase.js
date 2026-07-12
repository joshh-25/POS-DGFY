export const buildDeleteFolderUseCase = ({ itemRepository }) => {
    return async ({ folderId, replacementFolderId }) => itemRepository.deleteFolder(folderId, replacementFolderId);
};

export const buildDeleteFolderUseCase = ({ itemRepository }) => {
    return async ({ folderId }) => itemRepository.deleteFolder(folderId);
};

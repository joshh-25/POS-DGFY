export const buildUpdateFolderUseCase = ({ itemRepository }) => {
    return async ({ folderId, payload }) => itemRepository.updateFolder(folderId, payload);
};

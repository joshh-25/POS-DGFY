export const buildGetFoldersUseCase = ({ itemRepository }) => {
    return async () => itemRepository.listFolders();
};


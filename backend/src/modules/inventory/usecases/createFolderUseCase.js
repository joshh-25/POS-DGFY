export const buildCreateFolderUseCase = ({ itemRepository }) => {
    return async ({ name, description }) => itemRepository.createFolder(name, description);
};


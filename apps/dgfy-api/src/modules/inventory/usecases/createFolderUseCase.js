export const buildCreateFolderUseCase = ({ itemRepository }) => {
    return async ({ name, description }) => itemRepository.createFolder(
        String(name || '').trim(),
        String(description || '').trim()
    );
};

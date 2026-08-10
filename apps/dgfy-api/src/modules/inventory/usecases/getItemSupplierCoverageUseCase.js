export const buildGetItemSupplierCoverageUseCase = ({ itemRepository }) => {
    return async () => itemRepository.getItemSupplierCoverage();
};


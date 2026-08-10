export const SalesRepositoryContract = Object.freeze([
  'listUnifiedTransactions'
]);

export const assertSalesRepositoryContract = (repository) => {
  SalesRepositoryContract.forEach((method) => {
    if (typeof repository?.[method] !== 'function') {
      throw new Error(`SalesRepository missing required method: ${method}`);
    }
  });
};


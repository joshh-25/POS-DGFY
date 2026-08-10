import { salesRepository } from './repositories/salesRepository.js';
import { buildListSalesTransactionsUseCase } from './usecases/listSalesTransactionsUseCase.js';

export const listSalesTransactionsUseCase = buildListSalesTransactionsUseCase({ salesRepository });

export * from './contracts/salesRepository.contract.js';
export * from './repositories/salesRepository.js';


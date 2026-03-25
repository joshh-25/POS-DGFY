import { posRepository } from './repositories/posRepository.js';
import { createStockMovement } from '../../services/stockMovementService.js';
import {
    buildListPosCatalogUseCase,
    buildCheckoutPosUseCase,
    buildListPosTransactionsUseCase,
    buildGetPosTransactionByIdUseCase,
    buildCloseDayZReadingUseCase,
    buildGetDailyZReadingUseCase
} from './usecases/posUseCases.js';

const stockMovementService = { createStockMovement };

export const listPosCatalogUseCase = buildListPosCatalogUseCase({ posRepository });
export const checkoutPosUseCase = buildCheckoutPosUseCase({ posRepository, stockMovementService });
export const listPosTransactionsUseCase = buildListPosTransactionsUseCase({ posRepository });
export const getPosTransactionByIdUseCase = buildGetPosTransactionByIdUseCase({ posRepository });
export const closeDayZReadingUseCase = buildCloseDayZReadingUseCase({ posRepository });
export const getDailyZReadingUseCase = buildGetDailyZReadingUseCase({ posRepository });


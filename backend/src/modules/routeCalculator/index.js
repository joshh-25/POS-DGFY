import { routeCalculatorRepository } from './repositories/routeCalculatorRepository.js';
import { buildCalculateRouteUseCase } from './usecases/routeCalculatorUseCases.js';

export const calculateRouteUseCase = buildCalculateRouteUseCase({ routeCalculatorRepository });

export { routeCalculatorRepository };

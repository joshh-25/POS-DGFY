import * as forecastService from '../../services/forecastService.js';
import { buildGetStockForecastUseCase } from './usecases/getStockForecastUseCase.js';

export const getStockForecastUseCase = buildGetStockForecastUseCase({ forecastService });

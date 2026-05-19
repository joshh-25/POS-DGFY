import { geoSearchRepository } from './repositories/geoSearchRepository.js';
import { buildGeoSearchUseCase } from './usecases/geoSearchUseCases.js';

export const geoSearchUseCase = buildGeoSearchUseCase({ geoSearchRepository });

export { geoSearchRepository };

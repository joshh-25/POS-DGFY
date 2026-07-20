import { geoSearchRepository } from './repositories/geoSearchRepository.js';
import { buildGeoSearchUseCase, buildReverseGeocodeUseCase } from './usecases/geoSearchUseCases.js';

export const geoSearchUseCase = buildGeoSearchUseCase({ geoSearchRepository });
export const reverseGeocodeUseCase = buildReverseGeocodeUseCase();

export { geoSearchRepository };

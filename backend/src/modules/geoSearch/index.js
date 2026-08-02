import { geoSearchRepository } from './repositories/geoSearchRepository.js';
import { buildAddressSearchUseCase, buildGeoSearchUseCase, buildReverseGeocodeUseCase } from './usecases/geoSearchUseCases.js';

export const geoSearchUseCase = buildGeoSearchUseCase({ geoSearchRepository });
export const reverseGeocodeUseCase = buildReverseGeocodeUseCase();
export const addressSearchUseCase = buildAddressSearchUseCase();

export { geoSearchRepository };

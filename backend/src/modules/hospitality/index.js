import { hospitalityRepository } from './repositories/hospitalityRepository.js';
import { buildHospitalityUseCases } from './usecases/hospitalityUseCases.js';

export const hospitalityUseCases = buildHospitalityUseCases({ hospitalityRepository });

export * from './repositories/hospitalityRepository.js';
export * from './usecases/hospitalityUseCases.js';

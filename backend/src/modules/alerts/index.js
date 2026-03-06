import * as alertService from '../../services/alertService.js';
import { buildGenerateAlertsUseCase } from './usecases/generateAlertsUseCase.js';

export const generateAlertsUseCase = buildGenerateAlertsUseCase({ alertService });

import { employeeRepository } from './repositories/employeeRepository.js';
import {
  buildCreateEmployeeUseCase,
  buildListEmployeesUseCase,
  buildUpdateEmployeeUseCase
} from './usecases/employeeUseCases.js';

export const listEmployeesUseCase = buildListEmployeesUseCase({ repository: employeeRepository });
export const createEmployeeUseCase = buildCreateEmployeeUseCase({ repository: employeeRepository });
export const updateEmployeeUseCase = buildUpdateEmployeeUseCase({ repository: employeeRepository });

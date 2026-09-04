import { employeeCreditRepository } from './repositories/employeeCreditRepository.js';
import {
  buildAdjustEmployeeCreditOutstandingUseCase,
  buildEmployeeCreditService,
  buildEnableEmployeeCreditForActiveEmployeesUseCase,
  buildGetEmployeeCreditReportUseCase,
  buildListEmployeeCreditCheckoutOptionsUseCase,
  buildListEmployeeCreditAccountsUseCase,
  buildLookupEmployeeCreditAccountUseCase,
  buildRecordEmployeeCreditRepaymentUseCase,
  buildUpdateEmployeeCreditAccountUseCase,
  buildUpdateEmployeeCreditEmployeeAccountUseCase
} from './usecases/employeeCreditUseCases.js';

export const employeeCreditService = buildEmployeeCreditService({ repository: employeeCreditRepository });
export const listEmployeeCreditAccountsUseCase = buildListEmployeeCreditAccountsUseCase({ repository: employeeCreditRepository });
export const enableEmployeeCreditForActiveEmployeesUseCase = buildEnableEmployeeCreditForActiveEmployeesUseCase({ repository: employeeCreditRepository });
export const listEmployeeCreditCheckoutOptionsUseCase = buildListEmployeeCreditCheckoutOptionsUseCase({ repository: employeeCreditRepository });
export const updateEmployeeCreditAccountUseCase = buildUpdateEmployeeCreditAccountUseCase({ repository: employeeCreditRepository });
export const updateEmployeeCreditEmployeeAccountUseCase = buildUpdateEmployeeCreditEmployeeAccountUseCase({ repository: employeeCreditRepository });
export const recordEmployeeCreditRepaymentUseCase = buildRecordEmployeeCreditRepaymentUseCase({ repository: employeeCreditRepository });
export const adjustEmployeeCreditOutstandingUseCase = buildAdjustEmployeeCreditOutstandingUseCase({ repository: employeeCreditRepository });
export const lookupEmployeeCreditAccountUseCase = buildLookupEmployeeCreditAccountUseCase({ repository: employeeCreditRepository });
export const getEmployeeCreditReportUseCase = buildGetEmployeeCreditReportUseCase({ repository: employeeCreditRepository });

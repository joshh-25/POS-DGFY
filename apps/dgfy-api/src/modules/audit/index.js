import { auditRepository } from './repositories/auditRepository.js';
import { buildListAuditLogsUseCase } from './usecases/listAuditLogsUseCase.js';

export { auditRepository };
export const auditListUseCase = buildListAuditLogsUseCase({ auditRepository });

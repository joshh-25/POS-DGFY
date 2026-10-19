import { pushDiagnosticsReadRepository } from './repositories/pushDiagnosticsReadRepository.js';
import { pushDiagnosticsAuditRepository } from './repositories/pushDiagnosticsAuditRepository.js';
import { pushDiagnosticsSettingsRepository } from './repositories/pushDiagnosticsSettingsRepository.js';
import { buildPushDiagnosticsUseCases } from './usecases/pushDiagnosticsUseCases.js';
import {
    pushDeliveryLogRepository,
    pushDiagnosticDeviceRepository,
    pushDiagnosticEnrollmentCodeRepository
} from '../pushDelivery/index.js';
import { resolvePushAdapter } from '../pushDelivery/adapters/index.js';
import { getPushReceiptSchedulerStatus } from '../../schedulers/pushReceiptScheduler.js';

export const pushDiagnosticsUseCases = buildPushDiagnosticsUseCases({
    readRepository: pushDiagnosticsReadRepository,
    auditRepository: pushDiagnosticsAuditRepository,
    settingsRepository: pushDiagnosticsSettingsRepository,
    deviceRepository: pushDiagnosticDeviceRepository,
    enrollmentRepository: pushDiagnosticEnrollmentCodeRepository,
    logRepository: pushDeliveryLogRepository,
    adapterResolver: resolvePushAdapter,
    getSchedulerStatus: getPushReceiptSchedulerStatus
});

export { buildPushDiagnosticsUseCases };

export default pushDiagnosticsUseCases;

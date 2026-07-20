import { serviceRepository } from './repositories/serviceRepository.js';
import * as emailService from '../../services/emailService.js';
import {
    buildListServiceCatalogUseCase,
    buildCreateServiceCatalogItemUseCase,
    buildUpdateServiceCatalogItemUseCase,
    buildListServiceResourcesUseCase,
    buildCreateServiceResourceUseCase,
    buildListServiceAssignmentsUseCase,
    buildCreateServiceAssignmentUseCase,
    buildUpdateServiceAssignmentUseCase,
    buildCreateServiceBookingUseCase,
    buildCreateServiceBookingBatchUseCase,
    buildCreateServiceBookingHoldUseCase,
    buildGetServiceAvailabilityUseCase,
    buildListServiceBookingsUseCase,
    buildUpdateServiceBookingStatusUseCase,
    buildGetServiceBookingByReferenceUseCase,
    buildClaimServiceBookingUseCase,
    buildServiceDashboardUseCase,
    buildListServiceWaitlistUseCase,
    buildCreateServiceWaitlistEntryUseCase,
    buildUpdateServiceWaitlistStatusUseCase,
    buildListServiceClientsUseCase,
    buildListServiceRemindersUseCase,
    buildQueueDueServiceRemindersUseCase,
    buildSendDueServiceRemindersUseCase
} from './usecases/serviceUseCases.js';

export const listServiceCatalogUseCase = buildListServiceCatalogUseCase({ serviceRepository });
export const createServiceCatalogItemUseCase = buildCreateServiceCatalogItemUseCase({ serviceRepository });
export const updateServiceCatalogItemUseCase = buildUpdateServiceCatalogItemUseCase({ serviceRepository });
export const listServiceResourcesUseCase = buildListServiceResourcesUseCase({ serviceRepository });
export const createServiceResourceUseCase = buildCreateServiceResourceUseCase({ serviceRepository });
export const listServiceAssignmentsUseCase = buildListServiceAssignmentsUseCase({ serviceRepository });
export const createServiceAssignmentUseCase = buildCreateServiceAssignmentUseCase({ serviceRepository });
export const updateServiceAssignmentUseCase = buildUpdateServiceAssignmentUseCase({ serviceRepository });
export const createServiceBookingUseCase = buildCreateServiceBookingUseCase({ serviceRepository });
export const createServiceBookingBatchUseCase = buildCreateServiceBookingBatchUseCase({ serviceRepository });
export const createServiceBookingHoldUseCase = buildCreateServiceBookingHoldUseCase({ serviceRepository });
export const getServiceAvailabilityUseCase = buildGetServiceAvailabilityUseCase({ serviceRepository });
export const listServiceBookingsUseCase = buildListServiceBookingsUseCase({ serviceRepository });
export const updateServiceBookingStatusUseCase = buildUpdateServiceBookingStatusUseCase({ serviceRepository });
export const getServiceBookingByReferenceUseCase = buildGetServiceBookingByReferenceUseCase({ serviceRepository });
export const claimServiceBookingUseCase = buildClaimServiceBookingUseCase({ serviceRepository });
export const serviceDashboardUseCase = buildServiceDashboardUseCase({ serviceRepository });
export const listServiceWaitlistUseCase = buildListServiceWaitlistUseCase({ serviceRepository });
export const createServiceWaitlistEntryUseCase = buildCreateServiceWaitlistEntryUseCase({ serviceRepository });
export const updateServiceWaitlistStatusUseCase = buildUpdateServiceWaitlistStatusUseCase({ serviceRepository });
export const listServiceClientsUseCase = buildListServiceClientsUseCase({ serviceRepository });
export const listServiceRemindersUseCase = buildListServiceRemindersUseCase({ serviceRepository });
export const queueDueServiceRemindersUseCase = buildQueueDueServiceRemindersUseCase({ serviceRepository });
export const sendDueServiceRemindersUseCase = buildSendDueServiceRemindersUseCase({ serviceRepository, emailService });

export * from './repositories/serviceRepository.js';

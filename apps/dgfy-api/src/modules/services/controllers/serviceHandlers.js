import {
    listServiceCatalogUseCase,
    createServiceCatalogItemUseCase,
    updateServiceCatalogItemUseCase,
    listServiceResourcesUseCase,
    createServiceResourceUseCase,
    listServiceAssignmentsUseCase,
    createServiceAssignmentUseCase,
    updateServiceAssignmentUseCase,
    createServiceBookingUseCase,
    createServiceBookingBatchUseCase,
    createServiceBookingHoldUseCase,
    getServiceAvailabilityUseCase,
    listServiceBookingsUseCase,
    updateServiceBookingStatusUseCase,
    getServiceBookingByReferenceUseCase,
    settleServiceBookingUseCase,
    claimServiceBookingUseCase,
    serviceDashboardUseCase,
    listServiceWaitlistUseCase,
    createServiceWaitlistEntryUseCase,
    updateServiceWaitlistStatusUseCase,
    listServiceClientsUseCase,
    listServiceRemindersUseCase,
    queueDueServiceRemindersUseCase,
    sendDueServiceRemindersUseCase,
    manageServiceOptionGroupsUseCase,
    calculateServiceQuoteUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { publishCatalogChange } from '../../shared/services/catalogChangeEventBus.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const publishCatalogInvalidation = async (req, reason, itemIds = []) => {
    const tenantId = req.user?.tenant_id || req.tenant?.id;
    if (!tenantId) return;
    await publishCatalogChange({ tenantId, reason, itemIds });
};

const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

const sendResult = (req, res, result, { statusCode = 200, message = null } = {}) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => statusCode,
    successPayloadResolver: () => ({
        success: true,
        data: result.data,
        ...(message ? { message } : {}),
        timestamp: timestamp()
    }),
    errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
});

export const listCatalog = async (req, res, next) => {
    try {
        const result = await listServiceCatalogUseCase({
            query: req.validatedQuery || req.query
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const createCatalogItem = async (req, res, next) => {
    try {
        const result = await createServiceCatalogItemUseCase({
            payload: req.validatedData || req.body
        });
        if (result.success) {
            await publishCatalogInvalidation(req, 'service_catalog_created', [result.data?.service?.item_id]);
        }
        return sendResult(req, res, result, { statusCode: 201, message: 'Service created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateCatalogItem = async (req, res, next) => {
    try {
        const result = await updateServiceCatalogItemUseCase({
            itemId: req.validatedParams?.item_id || req.params.item_id,
            payload: req.validatedData || req.body
        });
        if (result.success) {
            await publishCatalogInvalidation(req, 'service_catalog_updated', [result.data?.service?.item_id]);
        }
        return sendResult(req, res, result, { message: 'Service updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const listResources = async (req, res, next) => {
    try {
        const result = await listServiceResourcesUseCase({
            query: req.validatedQuery || req.query
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const createResource = async (req, res, next) => {
    try {
        const result = await createServiceResourceUseCase({
            payload: req.validatedData || req.body
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Service resource created successfully' });
    } catch (error) {
        next(error);
    }
};

export const listAssignments = async (req, res, next) => {
    try {
        const result = await listServiceAssignmentsUseCase({
            query: req.validatedQuery || req.query
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const createAssignment = async (req, res, next) => {
    try {
        const result = await createServiceAssignmentUseCase({
            payload: req.validatedData || req.body
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Service assignment created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateAssignment = async (req, res, next) => {
    try {
        const result = await updateServiceAssignmentUseCase({
            assignmentId: req.validatedParams?.assignment_id || req.params.assignment_id,
            payload: req.validatedData || req.body
        });
        return sendResult(req, res, result, { message: 'Service assignment updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const listBookings = async (req, res, next) => {
    try {
        const result = await listServiceBookingsUseCase({
            query: req.validatedQuery || req.query
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const createBooking = async (req, res, next) => {
    try {
        const result = await createServiceBookingUseCase({
            payload: req.validatedData || req.body,
            source: 'admin'
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Service booking created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateBookingStatus = async (req, res, next) => {
    try {
        const result = await updateServiceBookingStatusUseCase({
            bookingId: req.validatedParams?.booking_id || req.params.booking_id,
            payload: req.validatedData || req.body
        });
        return sendResult(req, res, result, { message: 'Service booking updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const settleBooking = async (req, res, next) => {
    try {
        const result = await settleServiceBookingUseCase({
            bookingId: req.validatedParams?.booking_id || req.params.booking_id,
            payload: req.validatedData || req.body,
            user: req.user
        });
        return sendResult(req, res, result, { message: 'Service booking settled successfully' });
    } catch (error) {
        next(error);
    }
};

export const dashboard = async (req, res, next) => {
    try {
        const result = await serviceDashboardUseCase();
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const listWaitlist = async (req, res, next) => {
    try {
        const result = await listServiceWaitlistUseCase({
            query: req.validatedQuery || req.query
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const createWaitlistEntry = async (req, res, next) => {
    try {
        const result = await createServiceWaitlistEntryUseCase({
            payload: req.validatedData || req.body
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Waitlist entry created successfully' });
    } catch (error) {
        next(error);
    }
};

export const createPublicWaitlistEntry = async (req, res, next) => {
    try {
        const result = await createServiceWaitlistEntryUseCase({
            payload: req.validatedData || req.body,
            source: 'storefront',
            storeCustomer: req.storeCustomer || null
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Waitlist entry created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateWaitlistStatus = async (req, res, next) => {
    try {
        const result = await updateServiceWaitlistStatusUseCase({
            waitlistEntryId: req.validatedParams?.waitlist_entry_id || req.params.waitlist_entry_id,
            payload: req.validatedData || req.body
        });
        return sendResult(req, res, result, { message: 'Waitlist entry updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const listClients = async (req, res, next) => {
    try {
        const result = await listServiceClientsUseCase({
            query: req.validatedQuery || req.query
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const listReminders = async (req, res, next) => {
    try {
        const result = await listServiceRemindersUseCase({
            query: req.validatedQuery || req.query
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const queueDueReminders = async (req, res, next) => {
    try {
        const result = await queueDueServiceRemindersUseCase({
            payload: req.validatedData || req.body
        });
        return sendResult(req, res, result, { message: 'Service reminders queued successfully' });
    } catch (error) {
        next(error);
    }
};

export const sendDueReminders = async (req, res, next) => {
    try {
        const result = await sendDueServiceRemindersUseCase({
            query: req.validatedQuery || req.query
        });
        return sendResult(req, res, result, { message: 'Service reminders processed successfully' });
    } catch (error) {
        next(error);
    }
};

export const listPublicCatalog = async (req, res, next) => {
    try {
        const result = await listServiceCatalogUseCase({
            query: req.validatedQuery || req.query,
            storefrontOnly: true
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const getPublicAvailability = async (req, res, next) => {
    try {
        const result = await getServiceAvailabilityUseCase({
            query: req.validatedQuery || req.query,
            storefrontOnly: true
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const createPublicBookingHold = async (req, res, next) => {
    try {
        const result = await createServiceBookingHoldUseCase({
            payload: req.validatedData || req.body,
            source: 'storefront',
            storeCustomer: req.storeCustomer || null
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Service booking hold created successfully' });
    } catch (error) {
        next(error);
    }
};

export const listPublicBookings = async (req, res, next) => {
    try {
        const customerId = req.storeCustomer?.customer_id || null;
        const result = await listServiceBookingsUseCase({
            query: {
                ...(req.validatedQuery || req.query || {}),
                store_customer_id: customerId
            }
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const createPublicBooking = async (req, res, next) => {
    try {
        const result = await createServiceBookingUseCase({
            payload: req.validatedData || req.body,
            source: 'storefront',
            storeCustomer: req.storeCustomer || null
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Service booking created successfully' });
    } catch (error) {
        next(error);
    }
};

export const createPublicBookingBatch = async (req, res, next) => {
    try {
        const result = await createServiceBookingBatchUseCase({
            payload: req.validatedData || req.body,
            source: 'storefront',
            storeCustomer: req.storeCustomer || null
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Service bookings created successfully' });
    } catch (error) {
        next(error);
    }
};

export const getPublicBooking = async (req, res, next) => {
    try {
        const result = await getServiceBookingByReferenceUseCase({
            publicReference: req.validatedParams?.public_reference || req.params.public_reference
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const claimPublicBooking = async (req, res, next) => {
    try {
        const result = await claimServiceBookingUseCase({
            publicReference: req.validatedParams?.public_reference || req.params.public_reference,
            claimToken: req.validatedData?.claim_token || req.body?.claim_token,
            storeCustomer: req.storeCustomer || null
        });
        return sendResult(req, res, result, { message: 'Service booking linked successfully' });
    } catch (error) {
        next(error);
    }
};

export const listOptionGroups = async (req, res, next) => {
    try {
        const result = await manageServiceOptionGroupsUseCase.listOptionGroups({
            tenantId: req.tenantId,
            status: req.query.status
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const getOptionGroupById = async (req, res, next) => {
    try {
        const result = await manageServiceOptionGroupsUseCase.getOptionGroupById({
            groupId: req.params.groupId,
            tenantId: req.tenantId
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const createOptionGroup = async (req, res, next) => {
    try {
        const result = await manageServiceOptionGroupsUseCase.createOptionGroup({
            tenantId: req.tenantId,
            ...(req.body || {})
        });
        return sendResult(req, res, result, { statusCode: 201, message: 'Service option group created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateOptionGroup = async (req, res, next) => {
    try {
        const result = await manageServiceOptionGroupsUseCase.updateOptionGroup({
            groupId: req.params.groupId,
            tenantId: req.tenantId,
            ...(req.body || {})
        });
        return sendResult(req, res, result, { message: 'Service option group updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const deactivateOption = async (req, res, next) => {
    try {
        const result = await manageServiceOptionGroupsUseCase.deactivateOption({
            optionId: req.params.optionId,
            tenantId: req.tenantId
        });
        return sendResult(req, res, result, { message: 'Service option deactivated successfully' });
    } catch (error) {
        next(error);
    }
};

export const assignItemOptionGroups = async (req, res, next) => {
    try {
        const result = await manageServiceOptionGroupsUseCase.assignItemOptionGroups({
            itemId: req.params.itemId,
            groupIds: req.body?.group_ids || [],
            tenantId: req.tenantId
        });
        return sendResult(req, res, result, { message: 'Service item option groups assigned successfully' });
    } catch (error) {
        next(error);
    }
};

export const getItemOptionGroups = async (req, res, next) => {
    try {
        const result = await manageServiceOptionGroupsUseCase.getItemOptionGroups({
            itemId: req.params.itemId,
            tenantId: req.tenantId,
            activeOnly: req.query.active_only !== 'false'
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

export const calculateServiceQuote = async (req, res, next) => {
    try {
        const result = await calculateServiceQuoteUseCase.calculateQuote({
            serviceItemId: req.body?.service_item_id || req.query?.service_item_id,
            selectedOptionIds: req.body?.selected_option_ids || req.body?.selected_options || [],
            quantity: req.body?.quantity || req.query?.quantity || 1,
            tenantId: req.tenantId
        });
        return sendResult(req, res, result);
    } catch (error) {
        next(error);
    }
};

import { Op } from 'sequelize';

export const TENANT_LOCATION_REFERENCE_SOURCES = Object.freeze([
    {
        key: 'itemLocationStocks',
        label: 'item location stock rows',
        modelName: 'ItemLocationStock',
        association: 'ItemLocationStock.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'fifoBatches',
        label: 'FIFO batches',
        modelName: 'FIFOBatch',
        association: 'FIFOBatch.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'stockMovements',
        label: 'stock movements',
        modelName: 'StockMovement',
        association: 'StockMovement.location,StockMovement.sourceLocation,StockMovement.destinationLocation',
        foreignKeys: ['location_id', 'source_location_id', 'destination_location_id'],
        where: (locationId) => ({
            [Op.or]: [
                { location_id: locationId },
                { source_location_id: locationId },
                { destination_location_id: locationId }
            ]
        })
    },
    {
        key: 'posTransactions',
        label: 'POS transactions',
        modelName: 'PosTransaction',
        association: 'PosTransaction.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'posTerminalShifts',
        label: 'POS terminal shifts',
        modelName: 'PosTerminalShift',
        association: 'PosTerminalShift.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'posShiftLocationTransitions',
        label: 'POS shift location transitions',
        modelName: 'PosShiftLocationTransition',
        association: 'PosShiftLocationTransition.fromLocation,PosShiftLocationTransition.toLocation',
        foreignKeys: ['from_location_id', 'to_location_id'],
        where: (locationId) => ({
            [Op.or]: [
                { from_location_id: locationId },
                { to_location_id: locationId }
            ]
        })
    },
    {
        key: 'posShiftLocationBackfillAudits',
        label: 'POS shift location backfill audits',
        modelName: 'PosShiftLocationBackfillAudit',
        association: 'PosShiftLocationBackfillAudit.previousLocation,PosShiftLocationBackfillAudit.resolvedLocation',
        foreignKeys: ['previous_location_id', 'resolved_location_id'],
        where: (locationId) => ({
            [Op.or]: [
                { previous_location_id: locationId },
                { resolved_location_id: locationId }
            ]
        })
    },
    {
        key: 'userLocationGrants',
        label: 'user location grants',
        modelName: 'UserLocationGrant',
        association: 'UserLocationGrant.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'serviceProviderAssignments',
        label: 'service provider assignments',
        modelName: 'ServiceProviderAssignment',
        association: 'ServiceProviderAssignment.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'serviceResources',
        label: 'service resources',
        modelName: 'ServiceResource',
        association: 'ServiceResource.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'serviceBookings',
        label: 'service bookings',
        modelName: 'ServiceBooking',
        association: 'ServiceBooking.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'serviceBookingHolds',
        label: 'service booking holds',
        modelName: 'ServiceBookingHold',
        association: 'ServiceBookingHold.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'hospitalityRoomTypes',
        label: 'hospitality room types',
        modelName: 'HospitalityRoomType',
        association: 'HospitalityRoomType.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'hospitalityRooms',
        label: 'hospitality rooms',
        modelName: 'HospitalityRoom',
        association: 'HospitalityRoom.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'hospitalityPropertyAmenities',
        label: 'hospitality property amenities',
        modelName: 'HospitalityPropertyAmenity',
        association: 'HospitalityPropertyAmenity.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'hospitalityFacilities',
        label: 'hospitality facilities',
        modelName: 'HospitalityFacility',
        association: 'HospitalityFacility.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    }
]);

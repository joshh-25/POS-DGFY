import { Op } from 'sequelize';

export const TENANT_LOCATION_REFERENCE_SOURCES = Object.freeze([
    {
        key: 'deliveryJobs',
        label: 'delivery jobs',
        modelName: 'DeliveryJob',
        association: 'DeliveryJob.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'deliveryPersonnel',
        label: 'delivery personnel',
        modelName: 'DeliveryPersonnel',
        association: 'DeliveryPersonnel.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'itemLocationStocks',
        label: 'item location stock rows',
        modelName: 'ItemLocationStock',
        association: 'ItemLocationStock.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'inventoryReservations',
        label: 'inventory reservations',
        modelName: 'InventoryReservation',
        association: 'InventoryReservation.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'fnbModifierGroupLocationAvailability',
        label: 'F&B modifier group location availability rows',
        modelName: 'FnbModifierGroupLocationAvailability',
        association: 'FnbModifierGroupLocationAvailability.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'fnbModifierOptionLocationAvailability',
        label: 'F&B modifier option location availability rows',
        modelName: 'FnbModifierOptionLocationAvailability',
        association: 'FnbModifierOptionLocationAvailability.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'storefrontLocationItemOverrides',
        label: 'storefront branch item overrides',
        modelName: 'StorefrontLocationItemOverride',
        association: 'StorefrontLocationItemOverride.location',
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
        key: 'posParkedSales',
        label: 'POS parked sales',
        modelName: 'PosParkedSale',
        association: 'PosParkedSale.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'posPaymentSessions',
        label: 'POS split-payment sessions',
        modelName: 'PosPaymentSession',
        association: 'PosPaymentSession.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'posPaymentAllocations',
        label: 'POS split-payment allocations',
        modelName: 'PosPaymentAllocation',
        association: 'PosPaymentAllocation.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'posTransactionAdjustments',
        label: 'POS transaction adjustments',
        modelName: 'PosTransactionAdjustment',
        association: 'PosTransactionAdjustment.originalLocation,PosTransactionAdjustment.actorLocation',
        foreignKeys: ['original_location_id', 'actor_location_id'],
        where: (locationId) => ({
            [Op.or]: [
                { original_location_id: locationId },
                { actor_location_id: locationId }
            ]
        })
    },
    {
        key: 'posMerchantTenderReconciliations',
        label: 'POS merchant tender reconciliations',
        modelName: 'PosMerchantTenderReconciliation',
        association: 'PosMerchantTenderReconciliation.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'posFiscalTerminalRegistrations',
        label: 'POS fiscal terminal registrations',
        modelName: 'PosFiscalTerminalRegistration',
        association: 'PosFiscalTerminalRegistration.location',
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
        key: 'employees',
        label: 'employees',
        modelName: 'Employee',
        association: 'Employee.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    },
    {
        key: 'employeeCreditLedgerEntries',
        label: 'employee credit ledger entries',
        modelName: 'EmployeeCreditLedgerEntry',
        association: 'EmployeeCreditLedgerEntry.location',
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
        key: 'serviceBookingHandoffLegs',
        label: 'service booking handoff legs',
        modelName: 'ServiceBookingHandoffLeg',
        association: 'ServiceBookingHandoffLeg.location',
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
    },
    {
        key: 'voucherRedemptions',
        label: 'voucher redemptions',
        modelName: 'VoucherRedemption',
        association: 'VoucherRedemption.location',
        foreignKeys: ['location_id'],
        where: (locationId) => ({ location_id: locationId })
    }
]);

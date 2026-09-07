import { useStorefrontStore } from '../../../../store/useStorefrontStore.js';

const useServiceBookingField = (field, suffix) => [
  useStorefrontStore((state) => state.serviceBooking[field]),
  useStorefrontStore((state) => state[`serviceBookingSet${suffix}`])
];

/**
 * Services catalog and booking state bridge. Setters intentionally retain the
 * names and useState-compatible updater contract used by the existing shell
 * and service components.
 */
export function useServiceBookingState() {
  const [selectedServiceDetail, setSelectedServiceDetail] = useServiceBookingField('selectedServiceDetail', 'SelectedServiceDetail');
  const [selectedServiceCartLineId, setSelectedServiceCartLineId] = useServiceBookingField('selectedServiceCartLineId', 'SelectedServiceCartLineId');
  const [serviceDraftQuantity, setServiceDraftQuantity] = useServiceBookingField('draftQuantity', 'DraftQuantity');
  const [serviceDraftNotes, setServiceDraftNotes] = useServiceBookingField('draftNotes', 'DraftNotes');
  const [activeServiceTab, setActiveServiceTab] = useServiceBookingField('activeServiceTab', 'ActiveServiceTab');
  const [serviceSortOption, setServiceSortOption] = useServiceBookingField('sortOption', 'SortOption');
  const [isServiceFilterOpen, setIsServiceFilterOpen] = useServiceBookingField('isFilterOpen', 'IsFilterOpen');
  const [serviceAvailabilityFilter, setServiceAvailabilityFilter] = useServiceBookingField('availabilityFilter', 'AvailabilityFilter');
  const [serviceAreaFilter, setServiceAreaFilter] = useServiceBookingField('areaFilter', 'AreaFilter');
  const [serviceDurationFilter, setServiceDurationFilter] = useServiceBookingField('durationFilter', 'DurationFilter');
  const [serviceBookingStep, setServiceBookingStep] = useServiceBookingField('bookingStep', 'BookingStep');
  const [serviceOrderMethod, setServiceOrderMethod] = useServiceBookingField('orderMethod', 'OrderMethod');
  const [serviceScheduleMode, setServiceScheduleMode] = useServiceBookingField('scheduleMode', 'ScheduleMode');
  const [serviceSpecialInstructions, setServiceSpecialInstructions] = useServiceBookingField('specialInstructions', 'SpecialInstructions');
  const [servicePage, setServicePage] = useServiceBookingField('page', 'Page');
  const [servicePageSize, setServicePageSize] = useServiceBookingField('pageSize', 'PageSize');

  return {
    selectedServiceDetail,
    setSelectedServiceDetail,
    selectedServiceCartLineId,
    setSelectedServiceCartLineId,
    serviceDraftQuantity,
    setServiceDraftQuantity,
    serviceDraftNotes,
    setServiceDraftNotes,
    activeServiceTab,
    setActiveServiceTab,
    serviceSortOption,
    setServiceSortOption,
    isServiceFilterOpen,
    setIsServiceFilterOpen,
    serviceAvailabilityFilter,
    setServiceAvailabilityFilter,
    serviceAreaFilter,
    setServiceAreaFilter,
    serviceDurationFilter,
    setServiceDurationFilter,
    serviceBookingStep,
    setServiceBookingStep,
    serviceOrderMethod,
    setServiceOrderMethod,
    serviceScheduleMode,
    setServiceScheduleMode,
    serviceSpecialInstructions,
    setServiceSpecialInstructions,
    servicePage,
    setServicePage,
    servicePageSize,
    setServicePageSize
  };
}

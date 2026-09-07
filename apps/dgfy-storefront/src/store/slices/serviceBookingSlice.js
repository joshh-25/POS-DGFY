export const serviceBookingInitialState = {
  serviceBooking: {
    selectedServiceDetail: null,
    selectedServiceCartLineId: '',
    draftQuantity: 1,
    draftNotes: '',
    activeServiceTab: null,
    sortOption: 'recommended',
    isFilterOpen: false,
    availabilityFilter: 'all',
    areaFilter: 'all',
    durationFilter: 'all',
    bookingStep: 1,
    orderMethod: '',
    scheduleMode: '',
    specialInstructions: '',
    page: 1,
    pageSize: 8
  }
};

const updateServiceBookingField = (set, key, next) => set((s) => ({
  serviceBooking: {
    ...s.serviceBooking,
    [key]: typeof next === 'function' ? next(s.serviceBooking[key]) : next
  }
}));

const serviceBookingFields = {
  selectedServiceDetail: 'SelectedServiceDetail',
  selectedServiceCartLineId: 'SelectedServiceCartLineId',
  draftQuantity: 'DraftQuantity',
  draftNotes: 'DraftNotes',
  activeServiceTab: 'ActiveServiceTab',
  sortOption: 'SortOption',
  isFilterOpen: 'IsFilterOpen',
  availabilityFilter: 'AvailabilityFilter',
  areaFilter: 'AreaFilter',
  durationFilter: 'DurationFilter',
  bookingStep: 'BookingStep',
  orderMethod: 'OrderMethod',
  scheduleMode: 'ScheduleMode',
  specialInstructions: 'SpecialInstructions',
  page: 'Page',
  pageSize: 'PageSize'
};

export const createServiceBookingSlice = (set) => ({
  ...serviceBookingInitialState,
  ...Object.fromEntries(
    Object.entries(serviceBookingFields).map(([field, suffix]) => [
      `serviceBookingSet${suffix}`,
      (next) => updateServiceBookingField(set, field, next)
    ])
  )
});

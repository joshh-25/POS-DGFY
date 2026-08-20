import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildServiceBookingFieldPlan,
  buildServicePaymentOptions,
  isBookingFieldComplete,
  normalizeServiceFormFields
} from '../model/serviceBookingFields.js';
import {
  buildServiceCalendarDateOptions,
  buildServiceDateOptions,
  buildServiceTimeSlotOptions,
  getDatePartFromAppointment,
  getPreferredBookingTimeForDate as resolvePreferredBookingTimeForDate,
  getTimePartFromAppointment
} from '../model/serviceBookingSchedule.js';
import { buildServiceBookingSummaryModel } from '../model/serviceBookingSummary.js';
import { buildPinnedDeliveryAddress } from '../../../../features/locations/utils/pinnedDeliveryAddress.js';
import { trimAddressCountrySuffix } from '../../../../shared/model/storefrontCatalogModel.js';
import { getServicesLocalFlowDefinition } from '../model/servicesLocalFlow.js';

/**
 * Moved verbatim from `StorefrontApp.jsx`: the service-booking derivations
 * band (intake fields, payment options, booking field plan, date/time
 * parts, missing-field checks, and the booking summary model). Placed in
 * `modes/services/booking/hooks/` (alongside `useServiceCartDrawerProps.js`
 * and `useServiceBookingFieldFocus.js`) rather than `shared/hooks/` because
 * it imports service-booking model helpers from `modes/services/booking/
 * model/*` - `shared/` must not import from `modes/*`.
 *
 * All consumers of this hook's return values in the shell (`useCartMutations`
 * is called before this band; `useServiceBookingViewModel`,
 * `useCustomerAuthNavigation`, `useDeliveryPinResolution`, and
 * `useCheckoutSubmission` are all called after it) sit downstream of this
 * hook's original call site, so no ordering cycle is introduced by moving
 * these derivations into a hook at the same call-site position.
 */
export function useServiceBookingDerivations({
  customerAddress,
  customerEmail,
  customerName,
  customerPhone,
  customerPin,
  hasServiceCart,
  isServicesMode = false,
  money,
  resolvedDeliveryAddress,
  selectedServiceCartLineId,
  selectedServiceDetail,
  serviceAppointmentAt,
  serviceCartLines,
  serviceCartTotal,
  serviceDraftQuantity,
  serviceIntakeResponses,
  serviceOrderMethod = 'delivery',
  servicePaymentTiming,
  serviceUnitType,
  storefrontHours
}) {
  const [scheduleNow, setScheduleNow] = useState(() => new Date());
  useEffect(() => {
    if (!isServicesMode) return undefined;
    const intervalId = window.setInterval(() => setScheduleNow(new Date()), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [isServicesMode]);
  const firstServiceLine = serviceCartLines[0] || null;
  const activeServiceCartLine = useMemo(() => {
    if (!hasServiceCart) return null;
    const selectedLine = serviceCartLines.find((line) => String(line.cart_line_id || '') === String(selectedServiceCartLineId || ''));
    return selectedLine || firstServiceLine;
  }, [firstServiceLine, hasServiceCart, selectedServiceCartLineId, serviceCartLines]);
  const servicePaymentPolicy = activeServiceCartLine?.service_detail?.payment_policy || 'customer_choice';
  const selectedServicePaymentPolicy = selectedServiceDetail?.service_detail?.payment_policy || 'customer_choice';
  const serviceIntakeFields = useMemo(() => {
    return normalizeServiceFormFields(activeServiceCartLine?.service_detail?.intake_form_schema);
  }, [activeServiceCartLine]);
  const selectedServiceIntakeFields = useMemo(() => (
    normalizeServiceFormFields(selectedServiceDetail?.service_detail?.intake_form_schema)
  ), [selectedServiceDetail]);
  const missingRequiredIntake = useMemo(() => (
    serviceIntakeFields.filter((field) => {
      if (!field.required) return false;
      const value = serviceIntakeResponses[field.id];
      return field.type === 'checkbox' ? value !== true : !String(value || '').trim();
    })
  ), [serviceIntakeFields, serviceIntakeResponses]);
  const missingRequiredSelectedServiceIntake = useMemo(() => (
    selectedServiceIntakeFields.filter((field) => {
      if (!field.required) return false;
      const value = serviceIntakeResponses[field.id];
      return field.type === 'checkbox' ? value !== true : !String(value || '').trim();
    })
  ), [selectedServiceIntakeFields, serviceIntakeResponses]);
  const servicePaymentOptions = useMemo(() => {
    return buildServicePaymentOptions(servicePaymentPolicy);
  }, [servicePaymentPolicy]);
  const selectedServicePaymentOptions = useMemo(() => (
    buildServicePaymentOptions(selectedServicePaymentPolicy)
  ), [selectedServicePaymentPolicy]);
  const activeBookingService = activeServiceCartLine || selectedServiceDetail || null;
  const serviceFlow = getServicesLocalFlowDefinition(serviceOrderMethod);
  const bookingPageIntakeFields = hasServiceCart ? serviceIntakeFields : selectedServiceIntakeFields;
  const bookingPageMissingRequiredIntake = hasServiceCart ? missingRequiredIntake : missingRequiredSelectedServiceIntake;
  const bookingPagePaymentOptions = hasServiceCart ? servicePaymentOptions : selectedServicePaymentOptions;
  const bookingFieldPlan = useMemo(() => (
    buildServiceBookingFieldPlan({
      fields: bookingPageIntakeFields,
      serviceItem: activeBookingService
    })
  ), [bookingPageIntakeFields, activeBookingService]);
  const bookingStepOneAdditionalFields = useMemo(() => (
    [bookingFieldPlan.instructionField, ...bookingFieldPlan.remainingFields].filter(Boolean)
  ), [bookingFieldPlan.instructionField, bookingFieldPlan.remainingFields]);
  const selectedServiceDatePart = getDatePartFromAppointment(serviceAppointmentAt);
  const selectedServiceTimePart = getTimePartFromAppointment(serviceAppointmentAt);
  const scheduleOptions = useMemo(() => ({ storefrontHours, now: scheduleNow }), [scheduleNow, storefrontHours]);
  const bookingDateOptions = useMemo(() => (
    isServicesMode ? buildServiceDateOptions(activeBookingService, Number.POSITIVE_INFINITY, scheduleOptions) : []
  ), [activeBookingService, isServicesMode, scheduleOptions]);
  const bookingCalendarDateOptions = useMemo(() => (
    isServicesMode ? buildServiceCalendarDateOptions(activeBookingService, scheduleOptions) : []
  ), [activeBookingService, isServicesMode, scheduleOptions]);
  const bookingTimeSlotOptions = useMemo(() => (
    isServicesMode ? buildServiceTimeSlotOptions(activeBookingService, selectedServiceDatePart, scheduleOptions) : []
  ), [activeBookingService, isServicesMode, scheduleOptions, selectedServiceDatePart]);
  const getPreferredBookingTimeForDate = useCallback((serviceItem, dateString, currentTime = '') => (
    resolvePreferredBookingTimeForDate(serviceItem, dateString, currentTime, scheduleOptions)
  ), [scheduleOptions]);
  const missingStepOneAdditionalFields = useMemo(() => (
    bookingStepOneAdditionalFields.filter((field) => !isBookingFieldComplete(field, serviceIntakeResponses[field.id]))
  ), [bookingStepOneAdditionalFields, serviceIntakeResponses]);
  const isAddressRequired = bookingFieldPlan.addressField?.required === true || bookingFieldPlan.requiresAddress;
  const serviceLocationSummaryDraft = useMemo(() => (
    trimAddressCountrySuffix(
      resolvedDeliveryAddress
      || customerAddress
      || buildPinnedDeliveryAddress(customerPin)
      || ''
    )
  ), [customerAddress, customerPin, resolvedDeliveryAddress]);
  const missingCustomerInformation = useMemo(() => {
    const missing = [];
    if (!String(customerName || '').trim()) missing.push('Customer Name');
    if (!String(customerPhone || '').trim()) missing.push('Contact Number');
    if (bookingFieldPlan.emailField?.required && !String(customerEmail || '').trim()) missing.push('Email');
    return missing;
  }, [bookingFieldPlan.emailField?.required, customerEmail, customerName, customerPhone]);
  // Delivery always needs a destination, and Services currently supports scheduled
  // appointments only. Keep both requirements fail-closed before Review and Payment.
  const missingScheduleAndServiceInfo = useMemo(() => {
    const missing = [];
    if (serviceFlow.requiresAddress && !String(serviceLocationSummaryDraft || '').trim()) {
      missing.push('Service Location');
    }
    if (serviceFlow.requiresSchedule && !selectedServiceDatePart) missing.push('Preferred Date');
    if (serviceFlow.requiresSchedule && !selectedServiceTimePart) missing.push('Preferred Time Slot');
    if (bookingFieldPlan.unitTypeField && bookingFieldPlan.unitTypeField.required && !String(serviceUnitType || '').trim()) {
      missing.push(bookingFieldPlan.unitTypeField.label);
    }
    if (bookingFieldPlan.unitCountField && bookingFieldPlan.unitCountField.required && !(Number(serviceDraftQuantity || 0) > 0)) {
      missing.push(bookingFieldPlan.unitCountField.label);
    }
    return missing;
  }, [bookingFieldPlan.unitCountField, bookingFieldPlan.unitTypeField, selectedServiceDatePart, selectedServiceTimePart, serviceDraftQuantity, serviceFlow.requiresAddress, serviceFlow.requiresSchedule, serviceLocationSummaryDraft, serviceUnitType]);
  const accountStepComplete = missingCustomerInformation.length === 0;
  const fulfillmentStepComplete = missingScheduleAndServiceInfo.length === 0
    && missingStepOneAdditionalFields.length === 0;
  const stepOneComplete = accountStepComplete && fulfillmentStepComplete;
  const paymentStepComplete = serviceFlow.requiresPayment ? Boolean(servicePaymentTiming) : true;
  const reviewStepReady = stepOneComplete;
  const {
    bookingSummaryAmount,
    bookingSummaryQuantity,
    groupedServiceLineItems,
    reviewServiceLines,
    serviceBookingSummaryLineItems,
    serviceBookingSummaryRows,
    serviceBookingSummarySchedule,
    serviceBookingSummaryTitle
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verbatim from StorefrontApp.jsx; `money` intentionally omitted there too
  } = useMemo(() => buildServiceBookingSummaryModel({
    activeBookingService,
    firstServiceLine,
    hasServiceCart,
    money,
    serviceAppointmentAt,
    serviceCartLines,
    serviceCartTotal,
    serviceDraftQuantity,
    serviceIntakeResponses,
    serviceOrderMethod
  }), [
    activeBookingService,
    firstServiceLine,
    hasServiceCart,
    serviceAppointmentAt,
    serviceCartLines,
    serviceCartTotal,
    serviceDraftQuantity,
    serviceIntakeResponses,
    serviceOrderMethod
  ]);

  return {
    accountStepComplete,
    activeBookingService,
    activeServiceCartLine,
    bookingCalendarDateOptions,
    bookingDateOptions,
    bookingFieldPlan,
    bookingPageIntakeFields,
    bookingPageMissingRequiredIntake,
    bookingPagePaymentOptions,
    bookingStepOneAdditionalFields,
    bookingSummaryAmount,
    bookingSummaryQuantity,
    bookingTimeSlotOptions,
    firstServiceLine,
    fulfillmentStepComplete,
    groupedServiceLineItems,
    isAddressRequired,
    missingCustomerInformation,
    missingRequiredIntake,
    missingRequiredSelectedServiceIntake,
    missingScheduleAndServiceInfo,
    missingStepOneAdditionalFields,
    paymentStepComplete,
    reviewServiceLines,
    reviewStepReady,
    selectedServiceDatePart,
    selectedServiceIntakeFields,
    selectedServicePaymentOptions,
    selectedServiceTimePart,
    serviceBookingSummaryLineItems,
    serviceBookingSummaryRows,
    serviceBookingSummarySchedule,
    serviceBookingSummaryTitle,
    serviceIntakeFields,
    serviceLocationSummaryDraft,
    serviceFlow,
    getPreferredBookingTimeForDate,
    servicePaymentOptions,
    stepOneComplete
  };
}

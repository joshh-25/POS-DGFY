import { useState } from 'react';

/** Owns F&B-only checkout route state; it has no knowledge of other modes. */
export function useFnbCheckoutRouteState() {
  const [fnbOrderStep, setFnbOrderStep] = useState(2);
  const [fnbPaymentType, setFnbPaymentType] = useState('cash');
  const [fnbScheduledFor, setFnbScheduledFor] = useState('');
  const [fnbScheduleMode, setFnbScheduleMode] = useState('asap');
  const [fnbSpecialInstructions, setFnbSpecialInstructions] = useState('');
  const [showMobileAddressModal, setShowMobileAddressModal] = useState(false);

  return {
    fnbOrderStep,
    fnbPaymentType,
    fnbScheduledFor,
    fnbScheduleMode,
    fnbSpecialInstructions,
    setFnbOrderStep,
    setFnbPaymentType,
    setFnbScheduledFor,
    setFnbScheduleMode,
    setFnbSpecialInstructions,
    setShowMobileAddressModal,
    showMobileAddressModal,
  };
}

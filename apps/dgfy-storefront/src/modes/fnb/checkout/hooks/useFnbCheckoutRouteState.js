import { useEffect, useRef, useState } from 'react';

import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../../../../../packages/web-core/src/observability/analyticsEvents.js';

/** Owns F&B-only checkout route state; it has no knowledge of other modes. */
export function useFnbCheckoutRouteState() {
  const [fnbOrderStep, setFnbOrderStep] = useState(2);
  const [fnbPaymentType, setFnbPaymentType] = useState('cash');
  const [qrphPaymentSession, setQrphPaymentSession] = useState(null);
  const [qrphPaymentStatusLoading, setQrphPaymentStatusLoading] = useState(false);
  const [qrphIdempotencyKey, setQrphIdempotencyKey] = useState(() => (
    globalThis.crypto?.randomUUID?.() || `store-qrph-${Date.now()}`
  ));
  const [fnbScheduledFor, setFnbScheduledFor] = useState('');
  const [fnbScheduleMode, setFnbScheduleMode] = useState('asap');
  const [fnbSpecialInstructions, setFnbSpecialInstructions] = useState('');
  const [showMobileAddressModal, setShowMobileAddressModal] = useState(false);

  // fnbOrderStep is the existing numeric checkout-step tracker (customer
  // info -> fulfillment -> payment -> confirmation); reusing it here as a
  // single "step completed" event with a `step` property is cheaper and
  // more robust than instrumenting each step component's "Next" button.
  // Ref guard skips the initial-mount value so this only fires on real
  // step transitions.
  const hasMountedFnbOrderStepRef = useRef(false);
  useEffect(() => {
    if (!hasMountedFnbOrderStepRef.current) {
      hasMountedFnbOrderStepRef.current = true;
      return;
    }
    trackFunnelEvent(ANALYTICS_EVENTS.CHECKOUT_STEP_COMPLETED, { step: fnbOrderStep });
  }, [fnbOrderStep]);

  return {
    fnbOrderStep,
    fnbPaymentType,
    qrphIdempotencyKey,
    qrphPaymentSession,
    qrphPaymentStatusLoading,
    fnbScheduledFor,
    fnbScheduleMode,
    fnbSpecialInstructions,
    setFnbOrderStep,
    setFnbPaymentType,
    setQrphIdempotencyKey,
    setQrphPaymentSession,
    setQrphPaymentStatusLoading,
    setFnbScheduledFor,
    setFnbScheduleMode,
    setFnbSpecialInstructions,
    setShowMobileAddressModal,
    showMobileAddressModal,
  };
}

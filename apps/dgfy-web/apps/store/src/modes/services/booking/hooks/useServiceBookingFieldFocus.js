import { useCallback, useEffect, useRef, useState } from 'react';

export function useServiceBookingFieldFocus({ serviceBookingStep, setServiceBookingStep }) {
  const bookingPreferredDateInputRef = useRef(null);
  const bookingFieldRefs = useRef({});
  const [pendingBookingFocusKey, setPendingBookingFocusKey] = useState('');

  const openPreferredBookingDatePicker = useCallback(() => {
    const input = bookingPreferredDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Fall through to focus/click for browsers that block showPicker.
      }
    }
    input.focus();
    input.click();
  }, []);

  const registerBookingFieldRef = useCallback((key) => (node) => {
    if (!key) return;
    if (node) {
      bookingFieldRefs.current[key] = node;
    } else {
      delete bookingFieldRefs.current[key];
    }
  }, []);

  const jumpToBookingField = useCallback((step, fieldKey) => {
    setServiceBookingStep(step);
    setPendingBookingFocusKey(fieldKey);
  }, [setServiceBookingStep]);

  useEffect(() => {
    if (!pendingBookingFocusKey) return undefined;
    const node = bookingFieldRefs.current[pendingBookingFocusKey];
    if (!node) return undefined;
    const timer = window.requestAnimationFrame(() => {
      const focusTarget = typeof node.focus === 'function'
        ? node
        : node.querySelector?.('input, textarea, button, [tabindex]:not([tabindex="-1"])');
      node.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      focusTarget?.focus?.();
      setPendingBookingFocusKey('');
    });
    return () => window.cancelAnimationFrame(timer);
  }, [pendingBookingFocusKey, serviceBookingStep]);

  return {
    bookingPreferredDateInputRef,
    jumpToBookingField,
    openPreferredBookingDatePicker,
    registerBookingFieldRef
  };
}

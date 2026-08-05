// A backgrounded tab or a dropped connection is not a reason to keep
// polling: skipping the work (not the timer) here is what stops a
// disconnected/hidden tab from generating a steady stream of transient
// Sentry events every poll tick. Mirrors the inline check already used for
// QRPh payment polling (StorefrontApp.jsx's pollPaymentStatus) -- pulled out
// so a third poller doesn't have to reinvent it.
export const isDocumentVisibleAndOnline = () => (
  typeof document !== 'undefined'
  && document.visibilityState === 'visible'
  && (typeof navigator === 'undefined' || navigator.onLine !== false)
);

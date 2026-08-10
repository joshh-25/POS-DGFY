import { lazy, Suspense } from 'react';

// Issue #282, Phase G: see ServicesHeroLazy.jsx for why. Substring
// "HospitalityBookingPanel" preserved verbatim in the exported name so
// hospitalityStorefront.contract.test.js's source-text assertions against
// app/pages/StorefrontHeroBandContainer.jsx still match.
const LazyHospitalityBookingPanelImpl = lazy(() => import('./HospitalityBookingPanel.jsx'));

export default function HospitalityBookingPanel(props) {
  return (
    <Suspense fallback={<div style={{ minHeight: 316 }} />}>
      <LazyHospitalityBookingPanelImpl {...props} />
    </Suspense>
  );
}

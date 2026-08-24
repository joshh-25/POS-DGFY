import { FnbCheckoutJourneyHeader } from './FnbCheckoutJourneyHeader.jsx';

/**
 * Pure route-body view for the F&B checkout journey. Step contents remain
 * feature-owned children so this component never owns checkout state or APIs.
 */
export function FnbCheckoutRouteBody({ children, journeyHeaderProps, stepRenderKey }) {
  return (
    <>
      <FnbCheckoutJourneyHeader {...journeyHeaderProps} />
      <div key={stepRenderKey} style={{ display: 'grid', gap: 0, minWidth: 0 }}>
        {children}
      </div>
    </>
  );
}

import React, { Suspense } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { POS_PRESENTATION_SLOT_OWNERS } from '../utils/posPresentationBundle.js';

const FnbWorkflowPanel = lazyWithChunkRetry(() => import('./FnbWorkflowPanel.jsx').then(({ FnbWorkflowPanel: Component }) => ({ default: Component })));
const ServicesWorkflowPanel = lazyWithChunkRetry(() => import('./ServicesWorkflowPanel.jsx').then(({ ServicesWorkflowPanel: Component }) => ({ default: Component })));
const CounterWorkflowPanel = lazyWithChunkRetry(() => import('./CounterWorkflowPanel.jsx').then(({ CounterWorkflowPanel: Component }) => ({ default: Component })));

export function PosCheckoutDetailsSlot({
  presentationBundle,
  posWorkflow,
  orderMethod,
  setOrderMethod,
  tableNumber,
  setTableNumber,
  kitchenNotes,
  setKitchenNotes,
  servicesClientName,
  setServicesClientName,
  servicesDateTime,
  setServicesDateTime,
  servicesProvider,
  setServicesProvider,
  servicesResource,
  setServicesResource,
  servicesNotes,
  setServicesNotes,
  paymentTypeField = null,
  buttonLayout = false,
  isTabletViewport = false,
  disabled = false
}) {
  const checkoutDetailsOwner = presentationBundle?.slots?.checkoutDetails;
  const heading = presentationBundle?.labels?.checkoutDetailsHeading || 'Order details';
  const showHeading = !buttonLayout && presentationBundle?.labels?.showCheckoutDetailsHeading === true;

  return (
    <>
      {showHeading ? (
        <p className="text-[11px] font-black uppercase tracking-wide text-[#64748B]">
          {heading}
        </p>
      ) : null}
      <Suspense fallback={null}>
        {checkoutDetailsOwner === POS_PRESENTATION_SLOT_OWNERS.FNB && (
          <FnbWorkflowPanel
            orderMethod={orderMethod}
            setOrderMethod={setOrderMethod}
            tableNumber={tableNumber}
            setTableNumber={setTableNumber}
            kitchenNotes={kitchenNotes}
            setKitchenNotes={setKitchenNotes}
            paymentTypeField={paymentTypeField}
            buttonLayout={buttonLayout}
            isTabletViewport={isTabletViewport}
            disabled={disabled}
          />
        )}
        {checkoutDetailsOwner === POS_PRESENTATION_SLOT_OWNERS.SERVICES && (
          <ServicesWorkflowPanel
            visitType={orderMethod}
            setVisitType={setOrderMethod}
            clientName={servicesClientName}
            setClientName={setServicesClientName}
            appointmentDateTime={servicesDateTime}
            setAppointmentDateTime={setServicesDateTime}
            provider={servicesProvider}
            setProvider={setServicesProvider}
            resource={servicesResource}
            setResource={setServicesResource}
            serviceNotes={servicesNotes}
            setServiceNotes={setServicesNotes}
            disabled={disabled}
          />
        )}
        {checkoutDetailsOwner !== POS_PRESENTATION_SLOT_OWNERS.FNB
          && checkoutDetailsOwner !== POS_PRESENTATION_SLOT_OWNERS.SERVICES && (
          <CounterWorkflowPanel
            orderMethod={orderMethod}
            setOrderMethod={setOrderMethod}
            allowedMethods={Array.isArray(posWorkflow?.allowedMethods) ? posWorkflow.allowedMethods : []}
            buttonLayout={buttonLayout}
            disabled={disabled}
          />
        )}
        {checkoutDetailsOwner !== POS_PRESENTATION_SLOT_OWNERS.FNB && paymentTypeField}
      </Suspense>
    </>
  );
}

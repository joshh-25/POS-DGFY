import React, { lazy } from 'react';
import PosPageShell from './PosPageShell.jsx';

const SkupervisorPOSCheckoutTerminal = lazy(() => import('../components/SkupervisorPOSCheckoutTerminal.jsx'));

export default function POSPage() {
    return <PosPageShell CheckoutTerminal={SkupervisorPOSCheckoutTerminal} />;
}

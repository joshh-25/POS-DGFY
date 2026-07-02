import React, { lazy } from 'react';
import PosPageShell from './PosPageShell.jsx';

const POSCheckoutTerminal = lazy(() => import('../components/POSCheckoutTerminal.jsx'));

export default function POSPage() {
    return <PosPageShell CheckoutTerminal={POSCheckoutTerminal} />;
}

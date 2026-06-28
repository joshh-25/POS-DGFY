import React from 'react';
import SkupervisorPOSCheckoutTerminal from '../components/SkupervisorPOSCheckoutTerminal';
import PosPageShell from './PosPageShell.jsx';

export default function POSPage() {
    return <PosPageShell CheckoutTerminal={SkupervisorPOSCheckoutTerminal} />;
}

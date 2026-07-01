import React from 'react';
import POSCheckoutTerminal from '../components/POSCheckoutTerminal';
import PosPageShell from './PosPageShell.jsx';

export default function POSPage() {
    return <PosPageShell CheckoutTerminal={POSCheckoutTerminal} />;
}

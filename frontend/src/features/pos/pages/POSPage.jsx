import React from 'react';
import PosPageShell from './PosPageShell.jsx';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';

const POSCheckoutTerminal = lazyWithChunkRetry(() => import('../components/POSCheckoutTerminal.jsx'));

export default function POSPage() {
    return <PosPageShell CheckoutTerminal={POSCheckoutTerminal} />;
}

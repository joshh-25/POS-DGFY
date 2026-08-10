import React from 'react';
import PosPageShell from './PosPageShell.jsx';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';

const SkupervisorPOSCheckoutTerminal = lazyWithChunkRetry(() => import('../components/SkupervisorPOSCheckoutTerminal.jsx'));

export default function POSPage() {
    return <PosPageShell CheckoutTerminal={SkupervisorPOSCheckoutTerminal} />;
}

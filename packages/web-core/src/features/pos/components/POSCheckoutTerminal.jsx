import { Suspense } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { usePosTerminalViewModel } from '../hooks/usePosTerminalViewModel.js';

const POSCheckoutTerminalView = lazyWithChunkRetry(() => import('./POSCheckoutTerminalView.jsx'));

export default function POSCheckoutTerminal(props) {
    const terminalViewModel = {
        ...usePosTerminalViewModel(props),
    };

    return (
        <Suspense fallback={<div className="flex h-full min-h-0 items-center justify-center text-sm text-slate-500">Loading POS terminal…</div>}>
            <POSCheckoutTerminalView viewModel={terminalViewModel} />
        </Suspense>
    );
}

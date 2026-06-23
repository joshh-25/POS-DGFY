import React, { Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import ErrorBoundary from '../../../../src/components/common/ErrorBoundary.jsx';
import GlobalApiErrorListener from '../../../../src/components/common/GlobalApiErrorListener.jsx';
import { PermissionProvider } from '../../../../src/store/PermissionContext.jsx';
import { WorkflowModeProvider } from '../../../../src/features/settings/WorkflowModeContext.jsx';
import { Toaster } from '@/components/ui/sonner';
import TerminalPage from '../../../../src/features/pos/pages/TerminalPage.jsx';
import PosRouteNotFound from '../components/PosRouteNotFound.jsx';
import SkupervisorSalesRedirect from '../components/SkupervisorSalesRedirect.jsx';

export default function PosApp() {
  return (
    <React.StrictMode>
      <ErrorBoundary>
        <HashRouter>
          <PermissionProvider>
            <WorkflowModeProvider>
              <GlobalApiErrorListener />
              <Toaster position="top-right" />
              <Suspense fallback={<div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-500">Loading...</div>}>
                <Routes>
                  <Route path="/sales" element={<SkupervisorSalesRedirect />} />
                  <Route path="/" element={<TerminalPage />} />
                  <Route path="/terminal" element={<TerminalPage />} />
                  <Route path="/login" element={<TerminalPage />} />
                  <Route path="*" element={<PosRouteNotFound />} />
                </Routes>
              </Suspense>
            </WorkflowModeProvider>
          </PermissionProvider>
        </HashRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import TerminalPage from '../../../src/features/pos/pages/TerminalPage.jsx';
import ErrorBoundary from '../../../src/components/common/ErrorBoundary.jsx';
import GlobalApiErrorListener from '../../../src/components/common/GlobalApiErrorListener.jsx';
import { PermissionProvider } from '../../../src/store/PermissionContext.jsx';
import { WorkflowModeProvider } from '../../../src/features/settings/WorkflowModeContext.jsx';
import { Toaster } from '@/components/ui/sonner';
import '../../../src/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PermissionProvider>
        <WorkflowModeProvider>
          <GlobalApiErrorListener />
          <Toaster position="top-right" />
          <TerminalPage />
        </WorkflowModeProvider>
      </PermissionProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

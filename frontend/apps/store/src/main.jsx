import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import StorefrontApp from './StorefrontApp.jsx';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StorefrontApp />
      <Toaster richColors position="top-right" />
    </React.StrictMode>
  );
}

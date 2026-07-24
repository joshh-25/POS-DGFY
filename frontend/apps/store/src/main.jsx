import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import './index.css';
import StorefrontApp from './StorefrontApp.jsx';
import { initBrowserSentry } from '../../../src/observability/sentryClient.js';

const rootElement = document.getElementById('root');

initBrowserSentry({ surface: 'store' });

export function App() {
  return (
    <>
      <StorefrontApp />
      <Toaster richColors position="top-right" closeButton duration={2200} />
    </>
  );
}

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

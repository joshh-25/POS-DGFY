import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import './index.css';
import StorefrontApp from './StorefrontApp.jsx';

const rootElement = document.getElementById('root');

export function App() {
  return (
    <>
      <StorefrontApp />
      <Toaster richColors position="top-right" />
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

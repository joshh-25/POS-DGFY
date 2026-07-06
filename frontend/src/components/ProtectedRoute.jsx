import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getAccessToken, refreshBrowserSession } from '../services/browserSession.js';

/**
 * Protected Route Component
 * Ensures users are authenticated before accessing protected pages
 * Redirects to login page if no valid auth token exists
 */
export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState(() => (getAccessToken() ? 'authenticated' : 'checking'));

  useEffect(() => {
    if (status !== 'checking') return undefined;
    let cancelled = false;
    refreshBrowserSession()
      .then((token) => {
        if (!cancelled) setStatus(token ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    return () => { cancelled = true; };
  }, [status]);

  if (status === 'checking') {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-slate-50 px-6"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Checking your session</p>
            <p className="mt-0.5 text-xs text-slate-500">Loading your secure workspace...</p>
          </div>
        </div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    // Store the attempted URL to redirect back after login
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== '/login') {
      localStorage.setItem('redirectAfterLogin', currentPath);
    }

    return <Navigate to="/login" replace />;
  }

  // User is authenticated, render the protected content
  return children;
}

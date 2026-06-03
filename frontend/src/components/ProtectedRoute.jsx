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

  if (status === 'checking') return null;

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

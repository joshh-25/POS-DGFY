import React from 'react';
import { Navigate } from 'react-router-dom';
import { clearClientSession } from '../services/sessionCleanup.js';

/**
 * Protected Route Component
 * Ensures users are authenticated before accessing protected pages
 * Redirects to login page if no valid auth token exists
 */
export default function ProtectedRoute({ children }) {
  const authToken = localStorage.getItem('authToken');
  const refreshToken = localStorage.getItem('refreshToken');
  const companyToken = localStorage.getItem('companyToken');

  // If no tokens exist, redirect to login
  // If no tokens exist, redirect to login
  if (!authToken && !refreshToken) {
    // Store the attempted URL to redirect back after login
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== '/login') {
      localStorage.setItem('redirectAfterLogin', currentPath);
    }

    return <Navigate to="/login" replace />;
  }
  
  // Guard tenant context before mounting protected pages.
  // Missing company token causes repeated 401s on tenant routes.
  if (!companyToken) {
    clearClientSession({
      reason: 'tenant_context_missing',
      broadcast: true,
      emitAuthEvents: true,
      redirectTo: '/login?reason=tenant_context_missing'
    });
    return null;
  }

  // User is authenticated, render the protected content
  return children;
}

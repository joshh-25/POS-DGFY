import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

const StorePage = lazy(() => import('../pages/StorePage.jsx'));
const OrdersPage = lazy(() => import('../pages/OrdersPage.jsx'));
const AccountPage = lazy(() => import('../pages/AccountPage.jsx'));

function LoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      color: '#64748b'
    }}>
      Loading...
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/tenant-store" replace />} />
        <Route path="/tenant-store" element={<StorePage />} />
        <Route path="/tenant-store/:slug" element={<StorePage />} />
        <Route path="/tenant-store/:slug/orders" element={<OrdersPage />} />
        <Route path="/tenant-store/:slug/account" element={<AccountPage />} />
        <Route path="/store" element={<StorePage />} />
        <Route path="/store/:slug" element={<StorePage />} />
        <Route path="/store/:slug/orders" element={<OrdersPage />} />
        <Route path="/store/:slug/account" element={<AccountPage />} />
      </Routes>
    </Suspense>
  );
}
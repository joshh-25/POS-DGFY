import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getDefaultStorefrontPath } from './defaultStorefrontRoute.js';

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
        <Route path="/" element={<Navigate to={getDefaultStorefrontPath()} replace />} />
        <Route path="/map-dgfy/account" element={<Navigate to={getDefaultStorefrontPath('?dgfy_account=1')} replace />} />
        <Route path="/tenant-store/account" element={<Navigate to={getDefaultStorefrontPath('?dgfy_account=1')} replace />} />
        <Route path="/store-template" element={<Navigate to={getDefaultStorefrontPath()} replace />} />
        <Route path="/storefront-template" element={<Navigate to={getDefaultStorefrontPath()} replace />} />
        <Route path="/tenant-store/:slug/orders" element={<OrdersPage />} />
        <Route path="/tenant-store/:slug/account" element={<AccountPage />} />
        <Route path="/store/:slug/orders" element={<OrdersPage />} />
        <Route path="/store/:slug/account" element={<AccountPage />} />
      </Routes>
    </Suspense>
  );
}

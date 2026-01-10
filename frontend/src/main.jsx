import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Layout from '../Layout.jsx'
import Dashboard from '../Pages/Dashboard.jsx'
import Items from '../Pages/Items.jsx'
import Suppliers from '../Pages/Suppliers.jsx'
import PurchaseOrders from '../Pages/PurchaseOrders.jsx'
import JobOrders from '../Pages/JobOrders.jsx'
import StockMovements from '../Pages/StockMovements.jsx'
import Reports from '../Pages/Reports.jsx'
import Settings from '../Pages/Settings.jsx'
import Login from '../Pages/Login.jsx'
import Register from '../Pages/Register.jsx'
import MobileReceive from '../Pages/MobileReceive.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { getPageNameFromPath } from '../utils.js'
import './index.css'

function App() {
  const [isAuthenticating, setIsAuthenticating] = useState(true)
  const location = useLocation()
  const currentPageName = getPageNameFromPath(location.pathname)

  useEffect(() => {
    // Check authentication status on app startup
    setIsAuthenticating(false);
  }, []);

  if (isAuthenticating) {
    return <div>Loading...</div>;
  }

  return (
    <Routes>
      {/* Public routes - Login and Register pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected routes - require authentication */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/items" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <Items />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/suppliers" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <Suppliers />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/purchase-orders" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <PurchaseOrders />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/job-orders" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <JobOrders />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/stock-movements" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <StockMovements />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <Reports />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <Settings />
          </Layout>
        </ProtectedRoute>
      } />

      {/* Mobile receive page - no sidebar layout for phone-first UX */}
      <Route path="/receive/:token" element={
        <ProtectedRoute>
          <MobileReceive />
        </ProtectedRoute>
      } />
    </Routes>
  )
}

const rootElement = document.getElementById('root');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)


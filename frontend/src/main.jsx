import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import RegisterCompany from '../Pages/RegisterCompany.jsx'
import AcceptInvite from '../Pages/AcceptInvite.jsx'
import MobileReceive from '../Pages/MobileReceive.jsx'
import AiChat from '../Pages/AiChat.jsx'
import FeedbackViewer from '../Pages/FeedbackViewer.jsx'
import AdminLayout from '../Components/admin/AdminLayout.jsx'
import FeedbackDashboard from '../Pages/admin/FeedbackDashboard.jsx'
import TenantManager from '../Pages/admin/TenantManager.jsx'
import AdminPricing from '../Pages/admin/AdminPricing.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { PermissionProvider } from './store/PermissionContext.jsx'
import { getPageNameFromPath } from '../utils.js'
import './index.css'

function App() {
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const location = useLocation()
  const currentPageName = getPageNameFromPath(location.pathname)


  /* 
   * Authentication is handled by ProtectedRoute components. 
   * Global auth check can be added here if needed in future.
   */

  return (
    <Routes>
      {/* Public routes - Login and Register pages */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/register-company" element={<RegisterCompany />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />

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
      <Route path="/ai-chat" element={
        <ProtectedRoute>
          <Layout currentPageName={currentPageName}>
            <AiChat />
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

      {/* Admin Portal - nested routes with AdminLayout */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/tenants" replace />} />
        <Route path="feedback" element={<FeedbackDashboard />} />
        <Route path="tenants" element={<TenantManager />} />
        <Route path="pricing" element={<AdminPricing />} />
      </Route>

      {/* Legacy route - redirect to new admin portal */}
      <Route path="/admin/feedback-old" element={<FeedbackViewer />} />
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
      <PermissionProvider>
        <App />
      </PermissionProvider>
    </BrowserRouter>
  </React.StrictMode>,
)


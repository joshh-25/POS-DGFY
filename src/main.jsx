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
import { getPageNameFromPath } from '../utils.js'
import { login } from './services/authService.js'
import './index.css'

function App() {
  const [isAuthenticating, setIsAuthenticating] = useState(true)
  const location = useLocation()
  const currentPageName = getPageNameFromPath(location.pathname)

  useEffect(() => {
    // Auto-login on app startup if no token exists
    const autoLogin = async () => {
      // #region agent log
      const authToken = localStorage.getItem('authToken');
      const refreshToken = localStorage.getItem('refreshToken');
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:25',message:'Auto-login check',data:{hasAuthToken:!!authToken,hasRefreshToken:!!refreshToken},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (!authToken) {
        try {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:30',message:'Attempting auto-login',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Use the test credentials from CREDENTIALS.md
          await login({
            email: 'admin@test.com',
            password: 'Admin123!'
          });
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:37',message:'Auto-login successful',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
        } catch (error) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:40',message:'Auto-login failed',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.error('Auto-login failed:', error);
        }
      }
      setIsAuthenticating(false);
    };

    autoLogin();
  }, []);

  if (isAuthenticating) {
    return <div>Loading...</div>;
  }

  return (
    <Layout currentPageName={currentPageName}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/items" element={<Items />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/job-orders" element={<JobOrders />} />
        <Route path="/stock-movements" element={<StockMovements />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
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


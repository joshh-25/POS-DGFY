import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
// #region agent log
fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:4',message:'Before imports',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
// #endregion
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
import './index.css'
// #region agent log
fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:14',message:'After imports',data:{LayoutType:typeof Layout,DashboardType:typeof Dashboard},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
// #endregion

function App() {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:16',message:'App function entry',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const location = useLocation()
  const currentPageName = getPageNameFromPath(location.pathname)
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:20',message:'Before return JSX',data:{pathname:location.pathname,currentPageName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  try {
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
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:35',message:'App render error caught',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    throw error;
  }
}

// #region agent log
fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:36',message:'Before getElementById',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
// #endregion
const rootElement = document.getElementById('root');
// #region agent log
fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:39',message:'After getElementById',data:{rootElement:rootElement?rootElement.id:'null'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
// #endregion
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
// #region agent log
fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.jsx:47',message:'After render call',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
// #endregion


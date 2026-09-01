import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../../../packages/web-core/src/index.css';
import { Toaster } from '@/components/ui/sonner';
import PosDeliveryPricingSettingsCard from '@/src/features/pos/components/PosDeliveryPricingSettingsCard.jsx';

// Rendered-QA harness for #1341/PR #1342 (RF-1) -- mounts the actual, unmodified component this
// PR ships, through the real apps/dgfy-pos Vite config (same aliases the production build uses),
// with only its two network calls (GET/PUT /settings) intercepted by
// scripts/smoke-pos-delivery-pricing-ui.js. Query params let that script exercise both the
// settings:edit-gated and locked states without a second entry file.
const params = new URLSearchParams(window.location.search);
const canManage = params.get('canManage') !== 'false';
const locked = params.get('locked') === 'true';

const terminalUser = canManage
  ? { id: 501, role: 'admin', is_master_admin: false, permissions: ['settings:edit'] }
  : { id: 502, role: 'cashier', is_master_admin: false, permissions: [] };

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <PosDeliveryPricingSettingsCard
        terminalUser={terminalUser}
        locked={locked}
        sectionId="pos-delivery-pricing-smoke"
      />
    </div>
    <Toaster position="top-right" />
  </React.StrictMode>
);

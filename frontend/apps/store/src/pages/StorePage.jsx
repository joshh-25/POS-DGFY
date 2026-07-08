import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StoreDashboard } from '../Components/store/index.js';
import { STORE_DATA } from '../data/storeData.js';

export function StorePage() {
  const navigate = useNavigate();

  const handleNavigate = React.useCallback((kind) => {
    if (kind === 'brand') {
      navigate('/store-template');
      return;
    }
  }, [navigate]);

  const handleAction = React.useCallback(() => {
    // The template route is UI-only for now, so action buttons stay non-destructive.
  }, []);

  return (
    <StoreDashboard
      pageModel={STORE_DATA}
      onNavigate={handleNavigate}
      onAction={handleAction}
    />
  );
}

export default StorePage;

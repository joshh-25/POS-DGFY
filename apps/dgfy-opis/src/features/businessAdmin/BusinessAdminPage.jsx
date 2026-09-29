import React from 'react';
import SharedBusinessAdminPage from '../../../../../packages/web-core/src/features/businessAdmin/BusinessAdminPage.jsx';
import BusinessAdminAccountActions from './BusinessAdminAccountActions.jsx';

export default function BusinessAdminPage() {
  return (
    <SharedBusinessAdminPage
      surface="opis"
      accountActions={({ sidebarCollapsed }) => (
        <BusinessAdminAccountActions sidebarCollapsed={sidebarCollapsed} />
      )}
    />
  );
}

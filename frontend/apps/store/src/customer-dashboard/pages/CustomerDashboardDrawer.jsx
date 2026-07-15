import React from 'react';
import { DgfyCustomerAccountPage } from './DgfyCustomerAccountPage.jsx';

export function CustomerDashboardDrawer(props) {
  return <DgfyCustomerAccountPage {...props} presentation="drawer" />;
}

export default CustomerDashboardDrawer;

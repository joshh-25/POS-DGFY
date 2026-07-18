import React from 'react';
import { DgfyCustomerAccountPage } from './DgfyCustomerAccountPage.jsx';

export function CustomerDashboardPage(props) {
  return <DgfyCustomerAccountPage {...props} presentation="page" />;
}

export default CustomerDashboardPage;

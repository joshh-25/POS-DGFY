import React from 'react';
import { FnbCartDrawerContent } from '../components/FnbCartDrawerContent.jsx';

/**
 * F&B cart route mount. Cart state remains in the shell until cart state is
 * extracted; this component owns only the F&B-specific route presentation.
 */
export function FnbCartDrawerRoute({ isActive, ...cartDrawerProps }) {
  if (!isActive) return null;

  return <FnbCartDrawerContent {...cartDrawerProps} />;
}

import React from 'react';
import { Toaster } from '@/components/ui/sonner';

const SILENCED_POS_TOAST_CLASSES = Object.freeze({
  default: 'hidden',
  success: 'hidden',
  info: 'hidden'
});

export default function PosToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{ classNames: SILENCED_POS_TOAST_CLASSES }}
    />
  );
}

import { useEffect } from 'react';

/** Prevent page scroll from receiving gestures while a full-screen dialog is open. */
export function useModalScrollLock(isOpen) {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;

    const body = document.body;
    const documentElement = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    documentElement.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
    };
  }, [isOpen]);
}

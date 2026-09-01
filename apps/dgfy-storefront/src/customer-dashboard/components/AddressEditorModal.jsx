import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const getDraftSnapshot = (draft = {}) => JSON.stringify({
  label: String(draft.label || ''),
  address_line: String(draft.address_line || ''),
  latitude: draft.latitude ?? null,
  longitude: draft.longitude ?? null,
  is_default: Boolean(draft.is_default)
});

export function AddressEditorModal({ isMobileViewport, theme: THEME, addressModalMode, addressDraft, setAddressDraft, onClose, onSubmit, renderAddressPinEditor, accountAddressActionId, fieldStyle }) {
  const isCreate = addressModalMode === 'create';
  const isSaving = Boolean(String(accountAddressActionId || '').trim());
  const dialogRef = useRef(null);
  const initialFocusRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const initialDraftRef = useRef(getDraftSnapshot(addressDraft));
  const titleId = useId();
  const descriptionId = useId();
  const [isDirty, setIsDirty] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    setIsDirty(getDraftSnapshot(addressDraft) !== initialDraftRef.current);
  }, [addressDraft]);

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (isDirty) {
      const shouldDiscard = typeof window === 'undefined' || typeof window.confirm !== 'function'
        ? true
        : window.confirm('Discard your unsaved address changes?');
      if (!shouldDiscard) return;
    }
    onClose?.();
  }, [isDirty, isSaving, onClose]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    restoreFocusRef.current = document.activeElement;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverscrollBehavior = body.style.overscrollBehavior;
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    const focusTarget = initialFocusRef.current || dialogRef.current?.querySelector(FOCUSABLE_SELECTOR);
    focusTarget?.focus?.();

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overscrollBehavior = previousOverscrollBehavior;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  const handleDialogKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus?.();
      return;
    }
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, [requestClose]);

  const handleSubmit = async (event) => {
    setSubmitError('');
    try {
      const result = await onSubmit?.(event);
      if (result === false) {
        setSubmitError('We could not save this address. Check the details and try again.');
      }
    } catch {
      setSubmitError('We could not save this address. Check the details and try again.');
    }
  };

  const title = isCreate ? 'Add New Address' : 'Edit Address';
  const actionDisabled = isSaving || !String(addressDraft?.address_line || '').trim();

  return (
    <>
      <div
        data-testid="address-editor-overlay"
        style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: isMobileViewport ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobileViewport ? 0 : 16 }}
      >
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.48)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease' }}
          onClick={requestClose}
        />
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className="dgfy-address-editor__surface"
          onKeyDown={handleDialogKeyDown}
          style={{
            '--dgfy-address-primary': THEME.primary,
            position: 'relative',
            background: THEME.surface,
            width: isMobileViewport ? '100%' : 'min(820px, calc(100vw - 32px))',
            maxWidth: isMobileViewport ? '100%' : 'min(820px, calc(100vw - 32px))',
            height: 'auto',
            maxHeight: isMobileViewport ? '92dvh' : '90dvh',
            minHeight: 0,
            borderRadius: isMobileViewport ? '20px 20px 0 0' : 16,
            padding: isMobileViewport ? '14px 14px 0' : '20px 22px 0',
            boxShadow: '0 24px 80px rgba(15,23,42,0.28)',
            animation: isMobileViewport ? 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            boxSizing: 'border-box',
            overflow: 'hidden',
            overscrollBehavior: 'contain'
          }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingBottom: isMobileViewport ? 12 : 16, borderBottom: `1px solid ${THEME.border}` }}>
            <div style={{ minWidth: 0 }}>
              <h2 id={titleId} style={{ margin: 0, fontSize: isMobileViewport ? 18 : CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitle, lineHeight: 1.2, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitleWeight, color: THEME.text }}>
                {title}
              </h2>
              <p id={descriptionId} style={{ margin: '4px 0 0', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, lineHeight: 1.4, color: THEME.muted }}>
                {isCreate ? 'Save a location for faster checkout.' : 'Update this saved location.'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close address editor"
              onClick={requestClose}
              disabled={isSaving}
              className="dgfy-address-editor__icon-button"
              style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 10, width: isMobileViewport ? 44 : 40, height: isMobileViewport ? 44 : 40, flexShrink: 0, display: 'grid', placeItems: 'center', cursor: isSaving ? 'not-allowed' : 'pointer', color: THEME.muted, opacity: isSaving ? 0.6 : 1 }}
            >
              <X size={18} />
            </button>
          </header>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateRows: 'auto auto', minHeight: 0, overflow: 'hidden' }}>
            <div
              data-testid="address-editor-scroll-region"
              tabIndex={-1}
              style={{ display: 'grid', alignContent: 'start', gap: 12, minHeight: 0, maxHeight: isMobileViewport ? 'calc(92dvh - 156px)' : 'calc(90dvh - 176px)', overflowY: 'auto', overscrollBehavior: 'contain', padding: isMobileViewport ? '14px 2px 16px' : '16px 2px 18px', WebkitOverflowScrolling: 'touch' }}
            >
              {renderAddressPinEditor?.({
                draft: addressDraft,
                onChange: setAddressDraft,
                mode: addressModalMode,
                showDefaultAddressNote: isCreate,
                renderFormRow: () => (
                  <div data-testid="address-editor-fields" style={{ display: 'grid', gap: isMobileViewport ? 10 : 12, gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, lineHeight: 1.3, fontWeight: 700, color: THEME.text }}>
                      <span>Full Delivery Address <span aria-hidden="true" style={{ color: THEME.orange || '#b91c1c' }}>*</span></span>
                      <input
                        ref={initialFocusRef}
                        id="dgfy-modal-address-line"
                        autoFocus
                        aria-label="Full Delivery Address"
                        value={String(addressDraft?.address_line || '')}
                        onChange={(e) => setAddressDraft((previous) => ({ ...previous, address_line: e.target.value }))}
                        placeholder="e.g. 123 Main St, City, Province"
                        style={fieldStyle}
                        className="dgfy-address-editor__input"
                        required
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, lineHeight: 1.3, fontWeight: 700, color: THEME.text }}>
                      <span>Label / Landmark / Unit <span style={{ color: THEME.muted, fontWeight: 500 }}>(optional)</span></span>
                      <input
                        value={String(addressDraft?.label || '')}
                        onChange={(e) => setAddressDraft((previous) => ({ ...previous, label: e.target.value }))}
                        placeholder="e.g. Home, Office, Near Plaza"
                        style={fieldStyle}
                        className="dgfy-address-editor__input"
                      />
                    </label>
                  </div>
                )
              })}

              {!isCreate && (
                <label data-testid="address-editor-default-control" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 10 }}>
                  <input
                    type="checkbox"
                    aria-label="Set as default address"
                    checked={Boolean(addressDraft?.is_default)}
                    onChange={(e) => setAddressDraft((previous) => ({ ...previous, is_default: e.target.checked }))}
                    style={{ width: 18, height: 18, flexShrink: 0, accentColor: THEME.primary }}
                  />
                  <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, lineHeight: 1.35, fontWeight: 600, color: THEME.text }}>Set as default address</span>
                </label>
              )}

              {submitError ? <div role="alert" style={{ padding: '9px 12px', borderRadius: 8, background: THEME.orangeBg || '#fef2f2', color: THEME.orange || '#b91c1c', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, lineHeight: 1.4 }}>{submitError}</div> : null}
            </div>

            <div data-testid="address-editor-actions" className="dgfy-address-editor__actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 10, borderTop: `1px solid ${THEME.border}`, padding: isMobileViewport ? '12px 0 calc(12px + env(safe-area-inset-bottom))' : '12px 0 16px', background: THEME.surface }}>
              <button
                type="button"
                onClick={requestClose}
                disabled={isSaving}
                className="dgfy-address-editor__button dgfy-address-editor__button--secondary"
                style={{ flex: isMobileViewport ? '1 1 0%' : '0 0 auto', minWidth: isMobileViewport ? 0 : 112, minHeight: isMobileViewport ? 44 : 40, background: 'transparent', border: `1px solid ${THEME.border}`, borderRadius: 8, padding: '0 16px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, color: THEME.text, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionDisabled}
                className="dgfy-address-editor__button dgfy-address-editor__button--primary"
                style={{ flex: isMobileViewport ? '1 1 0%' : '0 0 auto', minWidth: isMobileViewport ? 0 : 148, minHeight: isMobileViewport ? 44 : 40, background: THEME.primary, border: 'none', borderRadius: 8, padding: '0 18px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, color: '#fff', cursor: actionDisabled ? 'not-allowed' : 'pointer', opacity: actionDisabled ? 0.6 : 1 }}
              >
                {isSaving ? 'Saving...' : 'Save Address'}
              </button>
            </div>
          </form>
        </section>
      </div>
      <style>{`
        .dgfy-address-editor__input:focus-visible,
        .dgfy-address-editor__button:focus-visible,
        .dgfy-address-editor__icon-button:focus-visible {
          outline: 2px solid var(--dgfy-address-primary, #1a4e8d);
          outline-offset: 2px;
        }
        @media (max-width: 839px) and (min-width: 640px) {
          .dgfy-address-editor__surface { width: min(760px, calc(100vw - 32px)) !important; max-width: min(760px, calc(100vw - 32px)) !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dgfy-address-editor__surface { animation: none !important; }
        }
      `}</style>
    </>
  );
}

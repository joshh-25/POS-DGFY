import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import {
  DOWNPAYMENT_TERMS_EFFECTIVE_DATE,
  DOWNPAYMENT_TERMS_SECTIONS,
  DOWNPAYMENT_TERMS_TITLE,
  DOWNPAYMENT_TERMS_VERSION
} from '../../model/downpaymentTermsDocument.js';

/**
 * Phase 219 (#1220): the full non-refundable downpayment terms, shown over the checkout step the
 * customer is already on.
 *
 * Deliberately an overlay and NOT a route: opening it must not unmount or reset in-progress
 * checkout state (#1220's "opening the terms must not lose checkout state"). It is also
 * deliberately NOT a gate -- there is no checkbox, no "I agree", and nothing here reports back to
 * the caller that the terms were opened. Recording acceptance is #1086's job, not this one's.
 * Follows StorefrontPaymentUnavailableModal.jsx's inline-style convention.
 *
 * Pat's deliberate override of #1220's own instruction (2026-08-31): this draft has NOT been
 * legally reviewed (#280 remains open), but that status is recorded internally only -- code
 * comments, docs/legal front matter, PR body -- and NOT as a visible banner in this customer-facing
 * dialog. Do not reintroduce a review-status notice here without Pat's sign-off.
 */
export function DownpaymentTermsModal({ open = false, onClose, bodyFont = 'inherit' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={DOWNPAYMENT_TERMS_TITLE}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', fontFamily: bodyFont }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '20px 20px 12px' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b' }}>{DOWNPAYMENT_TERMS_TITLE}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Version {DOWNPAYMENT_TERMS_VERSION} &middot; Effective {DOWNPAYMENT_TERMS_EFFECTIVE_DATE}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close downpayment terms"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: '#64748b', padding: 2 }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 20px', display: 'grid', gap: 14 }}>
          {DOWNPAYMENT_TERMS_SECTIONS.map((section) => (
            <div key={section.heading} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{section.heading}</div>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#475569' }}>{paragraph}</p>
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ width: '100%', minHeight: 44, borderRadius: 12, border: 'none', background: '#cbd5e1', color: '#1e293b', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

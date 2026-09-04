import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Star } from 'lucide-react';

import { STYLES } from '../../theme/storefrontStyleTokens.js';
import { STOREFRONT_CART_MOTION } from '../../theme/storefrontMotionTokens.js';
import { PrimaryButton } from '../StorefrontActionPrimitives.jsx';
import { maskReviewerName } from '../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { BOOKING_FIELD_STYLE } from '../../../modes/services/booking/model/serviceBookingFields.js';

const requestMotionFrame = (callback) => {
  if (typeof window.requestAnimationFrame === 'function') return window.requestAnimationFrame(callback);
  return window.setTimeout(() => callback(window.performance?.now?.() || Date.now()), 16);
};

const cancelMotionFrame = (frameId) => {
  if (frameId === null || frameId === undefined) return;
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }
  window.clearTimeout(frameId);
};

const easeReviewMotion = (progress) => 1 - ((1 - Math.min(1, Math.max(0, progress))) ** 3);

/**
 * StorefrontReviewModal — shared customer-review composer used by services and
 * simple modes. Extracted verbatim from two near-duplicate inline blocks in
 * StorefrontApp.jsx; the only per-mode differences (accent colours, title font,
 * star-key prefix, and message placeholder) are props. The `isReviewModalOpen`
 * gate stays at the call site.
 */
export function StorefrontReviewModal({
  isMobileViewport,
  eyebrowColor,
  titleFontFamily,
  starColor,
  starBg,
  starShadow,
  submitButtonAccentColor,
  submitButtonAccentDarkColor,
  submitButtonShadowColor,
  keyPrefix = 'review-rating',
  messagePlaceholder,
  reviewDraft,
  onReviewDraftChange,
  onClose,
  onSubmit
}) {
  const formScrollRef = useRef(null);
  const reviewTextareaRef = useRef(null);
  const initialViewportHeightRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const scrollAnimationStateRef = useRef(null);
  const reviewFieldFocusedRef = useRef(false);
  const [keyboardViewportHeight, setKeyboardViewportHeight] = useState(null);

  useEffect(() => {
    if (!isMobileViewport) return undefined;

    const viewport = window.visualViewport;
    if (initialViewportHeightRef.current === null) initialViewportHeightRef.current = window.innerHeight;
    const updateKeyboardViewport = () => {
      const viewportHeight = viewport?.height || window.innerHeight;
      const keyboardIsOpen = viewportHeight < (initialViewportHeightRef.current - 80);
      setKeyboardViewportHeight(keyboardIsOpen ? viewportHeight : null);
    };

    updateKeyboardViewport();
    viewport?.addEventListener('resize', updateKeyboardViewport);
    viewport?.addEventListener('scroll', updateKeyboardViewport);

    return () => {
      viewport?.removeEventListener('resize', updateKeyboardViewport);
      viewport?.removeEventListener('scroll', updateKeyboardViewport);
    };
  }, [isMobileViewport]);

  const cancelReviewScrollAnimation = useCallback(() => {
    cancelMotionFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
    scrollAnimationStateRef.current = null;
  }, []);

  const keepReviewFieldVisible = useCallback(() => {
    const formScroll = formScrollRef.current;
    const textarea = reviewTextareaRef.current;
    if (!formScroll || !textarea) return;

    requestMotionFrame(() => {
      const formBounds = formScroll.getBoundingClientRect();
      const textareaBounds = textarea.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const safeTop = Math.max(formBounds.top + 12, window.visualViewport?.offsetTop || 0);
      const safeBottom = Math.min(formBounds.bottom - 12, viewportHeight - 12);
      let scrollDelta = 0;

      if (textareaBounds.bottom > safeBottom) scrollDelta = textareaBounds.bottom - safeBottom;
      if (textareaBounds.top < safeTop) scrollDelta = textareaBounds.top - safeTop;
      const maxScrollTop = Math.max(0, formScroll.scrollHeight - formScroll.clientHeight);
      const nextTop = Math.min(maxScrollTop, Math.max(0, formScroll.scrollTop + scrollDelta));
      const activeAnimation = scrollAnimationStateRef.current;
      if (activeAnimation?.scrollContainer === formScroll) {
        activeAnimation.targetTop = nextTop;
        return;
      }
      if (Math.abs(nextTop - formScroll.scrollTop) < 1) return;

      cancelReviewScrollAnimation();
      const startTop = formScroll.scrollTop;
      const animationState = {
        scrollContainer: formScroll,
        startTop,
        targetTop: nextTop,
        startedAt: window.performance?.now?.() || Date.now()
      };
      scrollAnimationStateRef.current = animationState;

      const animateScroll = (now) => {
        if (scrollAnimationStateRef.current !== animationState) return;
        const progress = Math.min(1, (now - animationState.startedAt) / STOREFRONT_CART_MOTION.durationMs);
        const animationDistance = animationState.targetTop - animationState.startTop;
        animationState.scrollContainer.scrollTop = animationState.startTop + (animationDistance * easeReviewMotion(progress));
        if (progress < 1) {
          scrollFrameRef.current = requestMotionFrame(animateScroll);
        } else {
          animationState.scrollContainer.scrollTop = animationState.targetTop;
          scrollFrameRef.current = null;
          scrollAnimationStateRef.current = null;
        }
      };

      scrollFrameRef.current = requestMotionFrame(animateScroll);
    });
  }, [cancelReviewScrollAnimation]);

  const focusEditableFieldFromPointer = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const textarea = event.currentTarget;
    if (document.activeElement === textarea) return;
    try {
      textarea.focus({ preventScroll: true });
    } catch {
      textarea.focus();
    }
  }, []);

  const handleReviewFieldFocus = useCallback(() => {
    reviewFieldFocusedRef.current = true;
    keepReviewFieldVisible();
  }, [keepReviewFieldVisible]);

  const handleReviewFieldBlur = useCallback(() => {
    reviewFieldFocusedRef.current = false;
    cancelReviewScrollAnimation();
  }, [cancelReviewScrollAnimation]);

  useEffect(() => {
    if (!keyboardViewportHeight || !reviewTextareaRef.current || !reviewFieldFocusedRef.current) return undefined;

    const timerId = window.setTimeout(keepReviewFieldVisible, 120);
    return () => window.clearTimeout(timerId);
  }, [keyboardViewportHeight, keepReviewFieldVisible]);

  useEffect(() => () => cancelReviewScrollAnimation(), [cancelReviewScrollAnimation]);

  const effectiveKeyboardViewportHeight = isMobileViewport ? keyboardViewportHeight : null;
  const keyboardIsOpen = Boolean(effectiveKeyboardViewportHeight);
  const keyboardModalHeight = effectiveKeyboardViewportHeight ? Math.max(280, effectiveKeyboardViewportHeight - 24) : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: keyboardIsOpen ? 'auto' : 0,
        left: 0,
        height: keyboardIsOpen ? `${effectiveKeyboardViewportHeight}px` : undefined,
        zIndex: 2300,
        display: 'flex',
        alignItems: keyboardIsOpen ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: isMobileViewport ? 12 : 16
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.52)',
          backdropFilter: 'blur(5px)'
        }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="storefront-review-modal-title"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 640,
          height: keyboardModalHeight ? `${keyboardModalHeight}px` : undefined,
          maxHeight: isMobileViewport ? 'calc(100dvh - 24px)' : 'calc(100dvh - 32px)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          borderRadius: 28,
          border: '1px solid #dbe5ee',
          background: '#ffffff',
          boxShadow: '0 28px 64px rgba(15,23,42,0.22)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: isMobileViewport ? '20px 20px 0' : '28px 28px 0', flexShrink: 0, background: '#ffffff' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Customer Review
            </div>
            <div id="storefront-review-modal-title" style={{ fontSize: isMobileViewport ? 26 : 30, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.08, fontFamily: titleFontFamily }}>
              Share your experience
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: STYLES.colors.muted }}>
              Rate the storefront experience and leave a short message. Publishing will be connected once the review backend is ready.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#0f172a',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}
            aria-label="Close review modal"
          >
            <X size={18} />
          </button>
        </div>

        <div
          ref={formScrollRef}
          data-review-modal-form="true"
          style={{ display: 'grid', gap: isMobileViewport ? 12 : 14, padding: isMobileViewport ? '16px' : '16px 28px', overflowY: isMobileViewport ? 'auto' : 'visible', overflowX: 'hidden', flex: keyboardIsOpen ? '1 1 auto' : '0 0 auto', minHeight: keyboardIsOpen ? 0 : undefined, overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
            Your name
            <input
              onPointerDown={focusEditableFieldFromPointer}
              value={reviewDraft.name}
              onChange={(event) => onReviewDraftChange((previous) => ({ ...previous, name: event.target.value }))}
              placeholder="How should we identify your review?"
              style={BOOKING_FIELD_STYLE}
            />
          </label>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155', cursor: 'pointer', width: 'fit-content' }}>
              <input
                type="checkbox"
                checked={reviewDraft.anonymous}
                onChange={(event) => onReviewDraftChange((previous) => ({ ...previous, anonymous: event.target.checked }))}
              />
              Post this review anonymously
            </label>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Public name preview: <strong style={{ color: '#0f172a' }}>{reviewDraft.anonymous ? maskReviewerName(reviewDraft.name) : (String(reviewDraft.name || '').trim() || 'Your name')}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Your rating</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {Array.from({ length: 5 }, (_, index) => {
                const starValue = index + 1;
                const selected = reviewDraft.rating >= starValue;
                return (
                  <button
                    key={`${keyPrefix}-${starValue}`}
                    type="button"
                    onClick={() => onReviewDraftChange((previous) => ({ ...previous, rating: starValue }))}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      border: `1px solid ${selected ? starColor : '#dbe5ee'}`,
                      background: selected ? starBg : '#ffffff',
                      color: selected ? starColor : '#94a3b8',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: selected ? starShadow : 'none'
                    }}
                    aria-label={`Rate ${starValue} star${starValue === 1 ? '' : 's'}`}
                  >
                    <Star size={18} fill={selected ? starColor : 'none'} color={selected ? starColor : '#94a3b8'} />
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
            Your review
            <textarea
              ref={reviewTextareaRef}
              value={reviewDraft.message}
              onChange={(event) => onReviewDraftChange((previous) => ({ ...previous, message: event.target.value }))}
              onPointerDown={focusEditableFieldFromPointer}
              onFocus={handleReviewFieldFocus}
              onBlur={handleReviewFieldBlur}
              placeholder={messagePlaceholder}
              style={{ ...BOOKING_FIELD_STYLE, minHeight: isMobileViewport ? 96 : 120, resize: 'vertical', scrollMarginBlock: 16 }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', flexDirection: isMobileViewport ? 'column' : 'row', gap: 12, padding: isMobileViewport ? '0 20px 20px' : '0 28px 28px', flexShrink: 0, background: '#ffffff' }}>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
            Reviews are prepared on the storefront now. Submission and moderation will connect once backend review support is available.
          </div>
          <PrimaryButton
            onClick={onSubmit}
            accentColor={submitButtonAccentColor}
            accentDarkColor={submitButtonAccentDarkColor}
            shadowColor={submitButtonShadowColor}
            style={{ minHeight: 46, minWidth: isMobileViewport ? '100%' : 180, justifyContent: 'center' }}
          >
            Send Review
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}

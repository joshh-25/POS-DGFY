import React, { useEffect, useRef, useState } from 'react';
import {
  Accessibility,
  AlertTriangle,
  FileText,
  Gauge,
  Heart,
  HelpCircle,
  Lightbulb,
  LockKeyhole,
  Minus,
  MoreHorizontal,
  ThumbsDown,
  ThumbsUp,
  Upload,
  X
} from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const MAX_DETAILS_LENGTH = 500;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const FEEDBACK_MODAL_ICON_URL = '/feedback-2.jpg';

const EXPERIENCE_OPTIONS = [
  { value: 'good', label: 'Good', icon: ThumbsUp, color: '#15803D', background: '#ECFDF3' },
  { value: 'okay', label: 'Okay', icon: Minus, color: '#B45309', background: '#FFF7ED' },
  { value: 'bad', label: 'Bad', icon: ThumbsDown, color: '#B42318', background: '#FEF2F2' }
];

const FEEDBACK_TOPICS = [
  { value: 'Not Working', icon: AlertTriangle, color: '#D92D20' },
  { value: 'Suggestion', icon: Lightbulb, color: '#D97706' },
  { value: 'Hard to Use', icon: HelpCircle, color: '#7A5AF8' },
  { value: 'Wrong Info', icon: FileText, color: '#2E90FA' },
  { value: 'Website is Slow', icon: Gauge, color: '#039855' },
  { value: 'Trouble Using', icon: Accessibility, color: '#1570EF' },
  { value: 'Compliment', icon: Heart, color: '#E31B54' },
  { value: 'Other', icon: MoreHorizontal, color: '#667085' }
];

export function FeedbackModal({ open, isMobileViewport, onClose, theme }) {
  const closeButtonRef = useRef(null);
  const fileInputRef = useRef(null);
  const [experience, setExperience] = useState('');
  const [topic, setTopic] = useState('');
  const [details, setDetails] = useState('');
  const [screenshotName, setScreenshotName] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const documentElement = document.documentElement;
    const body = document.body;
    const previousDocumentElementOverflow = documentElement.style.overflow;
    const previousDocumentElementOverscrollBehavior = documentElement.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      documentElement.style.overflow = previousDocumentElementOverflow;
      documentElement.style.overscrollBehavior = previousDocumentElementOverscrollBehavior;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [onClose, open]);

  if (!open) return null;

  const handleExperienceChange = (value) => {
    setExperience(value);
    setError('');
    setSubmitted(false);
  };

  const handleTopicChange = (value) => {
    setTopic(value);
    setError('');
    setSubmitted(false);
  };

  const handleScreenshotChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SCREENSHOT_TYPES.has(file.type)) {
      setError('Choose a PNG, JPG, or WEBP screenshot.');
      setScreenshotName('');
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError('Choose a screenshot smaller than 5MB.');
      setScreenshotName('');
      return;
    }
    setError('');
    setSubmitted(false);
    setScreenshotName(file.name);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!experience || !topic) {
      setError(!experience ? 'Choose how your experience was before sending feedback.' : 'Choose a feedback topic before sending feedback.');
      setSubmitted(false);
      return;
    }
    setError('');
    setSubmitted(true);
  };

  const sectionTitleStyle = {
    margin: 0,
    color: theme.text,
    fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.sectionTitle.desktop,
    lineHeight: 1.3,
    fontWeight: 700
  };
  const labelStyle = {
    display: 'block',
    marginBottom: 7,
    color: theme.text,
    fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary,
    lineHeight: 1.3,
    fontWeight: 700
  };
  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    background: theme.surface,
    color: theme.text,
    fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body,
    outline: 'none'
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2600,
        display: 'flex',
        alignItems: isMobileViewport ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobileViewport ? 0 : 20,
        background: 'rgba(15, 23, 42, 0.52)'
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dgfy-feedback-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: isMobileViewport ? '100%' : 'min(520px, calc(100vw - 32px))',
          maxWidth: isMobileViewport ? 'none' : undefined,
          maxHeight: isMobileViewport ? 'calc(100dvh - 12px)' : 'min(760px, calc(100dvh - 40px))',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          overflow: 'hidden',
          border: `1px solid ${theme.border}`,
          borderRadius: isMobileViewport ? '18px 18px 0 0' : 18,
          background: theme.surface,
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)',
          overscrollBehavior: 'contain'
        }}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: isMobileViewport ? '16px 16px 12px' : '18px 20px 14px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <img data-testid="feedback-modal-icon" src={FEEDBACK_MODAL_ICON_URL} alt="" aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 14, objectFit: 'cover', objectPosition: 'center', display: 'block', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <h2 id="dgfy-feedback-title" style={{ margin: 0, color: theme.text, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitle : CUSTOMER_DASHBOARD_TYPOGRAPHY.modalHeroTitle.desktop, lineHeight: 1.15, fontWeight: 800 }}>Feedback</h2>
              <p style={{ margin: '4px 0 0', color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, lineHeight: 1.35 }}>Help us improve dgfy.ph</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close feedback" style={{ width: 36, height: 36, border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.surface, color: theme.muted, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', minHeight: 0 }}>
          <div data-testid="feedback-modal-scroll-region" style={{ minHeight: 0, overflowY: 'auto', padding: isMobileViewport ? '14px 16px 18px' : '16px 20px 18px', display: 'grid', alignContent: 'start', gap: 16 }}>
            <section aria-labelledby="feedback-experience-label" style={{ display: 'grid', gap: 8 }}>
              <h3 id="feedback-experience-label" style={sectionTitleStyle}>1. How was your experience?</h3>
              <div role="group" aria-label="Experience rating" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {EXPERIENCE_OPTIONS.map(({ value, label, icon: Icon, color, background }) => {
                  const isSelected = experience === value;
                  return (
                    <button key={value} type="button" aria-pressed={isSelected} onClick={() => handleExperienceChange(value)} style={{ minHeight: isMobileViewport ? 44 : 40, padding: '0 8px', border: `1px solid ${isSelected ? color : theme.border}`, borderRadius: 10, background: isSelected ? background : theme.surface, color: isSelected ? color : theme.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer' }}>
                      <Icon size={17} aria-hidden="true" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="feedback-topic-label" style={{ display: 'grid', gap: 8 }}>
              <h3 id="feedback-topic-label" style={sectionTitleStyle}>2. Feedback about</h3>
              <div data-testid="feedback-topic-scroll" role="group" aria-label="Feedback topics" style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', padding: '2px 2px 6px', margin: '0 -2px', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}>
                {FEEDBACK_TOPICS.map(({ value, icon: Icon, color }) => {
                  const isSelected = topic === value;
                  return (
                    <button key={value} type="button" aria-pressed={isSelected} onClick={() => handleTopicChange(value)} style={{ flex: '0 0 auto', minHeight: isMobileViewport ? 42 : 38, padding: '0 13px', border: `1px solid ${isSelected ? theme.primary : theme.border}`, borderRadius: 999, background: isSelected ? theme.primary : theme.surface, color: isSelected ? '#FFFFFF' : theme.text, whiteSpace: 'nowrap', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon size={15} aria-hidden="true" color={isSelected ? '#FFFFFF' : color} />
                      {value}
                    </button>
                  );
                })}
              </div>
            </section>

            {topic ? (
              <section style={{ display: 'grid', gap: 0 }}>
                <label htmlFor="dgfy-feedback-details" style={labelStyle}>3. Tell us more <span style={{ color: theme.muted, fontWeight: 500 }}>(optional)</span></label>
                <textarea id="dgfy-feedback-details" value={details} onChange={(event) => { setDetails(event.target.value.slice(0, MAX_DETAILS_LENGTH)); setSubmitted(false); }} placeholder="What would you like us to know?" maxLength={MAX_DETAILS_LENGTH} rows={4} style={{ ...inputStyle, minHeight: 96, padding: '10px 11px', resize: 'vertical', lineHeight: 1.45 }} />
                <div style={{ marginTop: 4, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, textAlign: 'right' }}>{details.length}/{MAX_DETAILS_LENGTH}</div>
              </section>
            ) : null}

            <section style={{ display: 'grid', gap: 8 }}>
              <div style={labelStyle}>{topic ? '4.' : '3.'} Screenshot <span style={{ color: theme.muted, fontWeight: 500 }}>(optional)</span></div>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ minHeight: 68, padding: '10px 12px', border: `1px dashed ${theme.border}`, borderRadius: 10, background: theme.bg, color: theme.primary, display: 'grid', placeItems: 'center', gap: 3, cursor: 'pointer' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700 }}><Upload size={17} aria-hidden="true" />{screenshotName || 'Upload screenshot'}</span>
                <span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro }}>{screenshotName ? 'Screenshot selected for this preview' : 'PNG, JPG or WEBP · Max. 5MB'}</span>
              </button>
              <input ref={fileInputRef} id="dgfy-feedback-screenshot" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleScreenshotChange} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }} />
            </section>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, lineHeight: 1.4 }}>
              <LockKeyhole size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Please avoid including personal or sensitive information.</span>
            </div>
          </div>

          <footer style={{ display: 'grid', gap: 8, padding: isMobileViewport ? '10px 16px 16px' : '10px 20px 18px', borderTop: `1px solid ${theme.border}`, background: theme.surface }}>
            {error ? <div role="alert" style={{ color: '#B42318', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, lineHeight: 1.35 }}>{error}</div> : null}
            {submitted ? <div role="status" style={{ color: theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, lineHeight: 1.35 }}>Feedback preview ready. Submission will be connected in a later step.</div> : null}
            <button type="submit" style={{ width: '100%', minHeight: isMobileViewport ? 44 : 42, border: 'none', borderRadius: 10, background: theme.primary, color: '#FFFFFF', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer' }}>Send Feedback</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default FeedbackModal;

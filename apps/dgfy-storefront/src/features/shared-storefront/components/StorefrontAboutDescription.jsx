import React, { useEffect, useId, useRef, useState } from 'react';
import './StorefrontAboutDescription.css';

export function StorefrontAboutDescription({ text, accentColor, fontFamily, fontSize = 13, lineHeight = 1.7, collapsible = true }) {
  const descriptionId = useId();
  const paragraphRef = useRef(null);
  const [expandedText, setExpandedText] = useState(null);
  const expanded = !collapsible || expandedText === text;
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const paragraph = paragraphRef.current;
    if (!paragraph) return undefined;
    if (!collapsible) {
      return undefined;
    }
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const lineHeight = Number.parseFloat(getComputedStyle(paragraph).lineHeight);
      // scrollHeight includes the hidden lines even while CSS clamps the preview.
      setOverflows(paragraph.scrollHeight > lineHeight * 2 + 1);
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(paragraph);
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [collapsible, text, fontFamily]);

  return (
    <div className="storefront-about-description" style={{ fontFamily, '--about-accent': accentColor, '--about-font-size': `${fontSize}px`, '--about-line-height': lineHeight }}>
      <p
        ref={paragraphRef}
        id={descriptionId}
        className="storefront-about-description__text"
        data-expanded={expanded}
      >
        {text}
      </p>
      {collapsible && overflows && (
        <button
          type="button"
          className="storefront-about-description__toggle"
          aria-expanded={expanded}
          aria-controls={descriptionId}
          onClick={() => setExpandedText((previous) => (previous === text ? null : text))}
        >
          {expanded ? 'See Less' : 'See More'}
        </button>
      )}
    </div>
  );
}

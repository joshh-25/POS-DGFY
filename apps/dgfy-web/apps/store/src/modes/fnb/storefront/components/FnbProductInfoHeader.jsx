import React from 'react';
import { ChevronDown, Star } from 'lucide-react';

const FNB_DISPLAY_FONT = '"Outfit", "Avenir Next", "Segoe UI", sans-serif';

/** Renders F&B product identity, review summary, and expandable description. */
export function FnbProductInfoHeader({
  accentColor = '#22C55E',
  description,
  displayFont = FNB_DISPLAY_FONT,
  compactTypography = false,
  isMobileViewport,
  itemName,
  ratingScore,
  reviewCount,
  spacing,
}) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = React.useState(false);
  const [showReadMore, setShowReadMore] = React.useState(false);
  const descriptionRef = React.useRef(null);
  const hasReviewSummary = Number.isFinite(Number(ratingScore)) && Number(ratingScore) > 0
    && Number.isFinite(Number(reviewCount)) && Number(reviewCount) > 0;

  React.useEffect(() => {
    if (!descriptionRef.current || isDescriptionExpanded) return;
    setShowReadMore(descriptionRef.current.scrollHeight > descriptionRef.current.clientHeight);
  }, [description, isDescriptionExpanded]);

  return (
    <div style={{ display: 'grid', gap: spacing(1) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, lineHeight: 1.15, fontWeight: compactTypography ? 700 : 900, color: '#0f172a', letterSpacing: compactTypography ? '-0.015em' : '-0.025em', display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontFamily: displayFont }}>
            {itemName}
            {hasReviewSummary ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '4px 8px', borderRadius: 12, lineHeight: 1 }}>
                <Star size={16} fill="#d97706" color="#d97706" />
                <span>{Number(ratingScore).toFixed(1)}</span>
                <span style={{ color: '#b45309', fontWeight: 600, fontSize: 12 }}>({Number(reviewCount)})</span>
              </span>
            ) : null}
          </h1>
        </div>
      </div>

      {description ? (
        <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
          <p
            ref={descriptionRef}
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: '#64748b',
              display: '-webkit-box',
              WebkitLineClamp: isDescriptionExpanded ? 'none' : 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {description}
          </p>
          {showReadMore ? (
            <button
              type="button"
              onClick={() => setIsDescriptionExpanded((previous) => !previous)}
              style={{ background: 'transparent', border: 'none', padding: '4px 0', fontSize: 12, fontWeight: 700, color: accentColor, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content' }}
            >
              {isDescriptionExpanded ? 'Read less' : 'Read more'}
              <ChevronDown size={16} style={{ transform: isDescriptionExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

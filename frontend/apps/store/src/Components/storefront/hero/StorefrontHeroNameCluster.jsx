import React from 'react';

const STOREFRONT_FOLLOW_STORE_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXN0b3JlLWljb24gbHVjaWRlLXN0b3JlIj48cGF0aCBkPSJNMTUgMjF2LTVhMSAxIDAgMCAwLTEtMWgtNGExIDEgMCAwIDAtMSAxdjUiLz48cGF0aCBkPSJNMTcuNzc0IDEwLjMxYTEuMTIgMS4xMiAwIDAgMC0xLjU0OSAwIDIuNSAyLjUgMCAwIDEtMy40NTEgMCAxLjEyIDEuMTIgMCAwIDAtMS41NDggMCAyLjUgMi41IDAgMCAxLTMuNDUyIDAgMS4xMiAxLjEyIDAgMCAwLTEuNTQ5IDAgMi41IDIuNSAwIDAgMS0zLjc3LTMuMjQ4bDIuODg5LTQuMTg0QTIgMiAwIDAgMSA3IDJoMTBhMiAyIDAgMCAxIDEuNjUzLjg3M2wyLjg5NSA0LjE5MmEyLjUgMi41IDAgMCAxLTMuNzc0IDMuMjQ0Ii8+PHBhdGggZD0iTTQgMTAuOTVWMTlhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0ydi04LjA1Ii8+PC9zdmc+';

function StoreFollowGlyph({
  isFollowing = false,
  size = 18,
  tone = 'currentColor',
  badgeSize = 14,
  badgeTextSize = 10
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        flexShrink: 0
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          display: 'inline-block',
          backgroundColor: tone,
          WebkitMaskImage: `url("${STOREFRONT_FOLLOW_STORE_ICON}")`,
          maskImage: `url("${STOREFRONT_FOLLOW_STORE_ICON}")`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain'
        }}
      />
      <span
        style={{
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: badgeSize,
          height: badgeSize,
          borderRadius: '50%',
          background: isFollowing ? '#22c55e' : '#f97316',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: badgeTextSize,
          fontWeight: 900,
          lineHeight: 1,
          boxShadow: '0 4px 10px rgba(15,23,42,.18)'
        }}
      >
        {isFollowing ? '\u2713' : '+'}
      </span>
    </span>
  );
}

export function StorefrontHeroNameCluster({
  name,
  textColor = '#fff',
  fontFamily,
  fontSize,
  followEnabled = false,
  followState,
  handleFollowAction
}) {
  const followError = String(followState?.error || '').trim();
  return (
    <div style={{ display: 'grid', gap: followError ? 6 : 0, justifyItems: 'start', maxWidth: '100%' }}>
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 'fit-content',
          maxWidth: '100%',
          minWidth: 0,
          paddingRight: followEnabled ? 28 : 0
        }}
      >
        <h1
          style={{
            color: textColor,
            display: 'inline',
            fontFamily,
            fontSize,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: 0,
            minWidth: 0,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word'
          }}
        >
          {name}
        </h1>
        {followEnabled && (
          <button
            type="button"
            aria-label={followState.isFollowing ? 'Unfollow this storefront' : 'Follow this storefront'}
            title={followState.isFollowing ? 'Following' : 'Follow'}
            disabled={followState.loading}
            onClick={handleFollowAction}
            style={{
              position: 'absolute',
              right: 0,
              bottom: '0.16em',
              border: 'none',
              background: 'transparent',
              color: textColor,
              minHeight: 24,
              minWidth: 24,
              width: 24,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: followState.loading ? 0.72 : 1,
              cursor: followState.loading ? 'not-allowed' : 'pointer'
            }}
          >
            <StoreFollowGlyph isFollowing={followState.isFollowing} size={18} tone={textColor} badgeSize={13} badgeTextSize={9} />
          </button>
        )}
      </div>
      {followEnabled && followError && (
        <span
          role="status"
          style={{
            background: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid rgba(248, 113, 113, 0.45)',
            borderRadius: 8,
            color: '#991b1b',
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.35,
            maxWidth: 'min(360px, 100%)',
            padding: '5px 8px'
          }}
        >
          {followError}
        </span>
      )}
    </div>
  );
}

export default StorefrontHeroNameCluster;

import React from 'react';

const STOREFRONT_FOLLOW_STORE_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXN0b3JlLWljb24gbHVjaWRlLXN0b3JlIj48cGF0aCBkPSJNMTUgMjF2LTVhMSAxIDAgMCAwLTEtMWgtNGExIDEgMCAwIDAtMSAxdjUiLz48cGF0aCBkPSJNMTcuNzc0IDEwLjMxYTEuMTIgMS4xMiAwIDAgMC0xLjU0OSAwIDIuNSAyLjUgMCAwIDEtMy40NTEgMCAxLjEyIDEuMTIgMCAwIDAtMS41NDggMCAyLjUgMi41IDAgMCAxLTMuNDUyIDAgMS4xMiAxLjEyIDAgMCAwLTEuNTQ5IDAgMi41IDIuNSAwIDAgMS0zLjc3LTMuMjQ4bDIuODg5LTQuMTg0QTIgMiAwIDAgMSA3IDJoMTBhMiAyIDAgMCAxIDEuNjUzLjg3M2wyLjg5NSA0LjE5MmEyLjUgMi41IDAgMCAxLTMuNzc0IDMuMjQ0Ii8+PHBhdGggZD0iTTQgMTAuOTVWMTlhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0ydi04LjA1Ii8+PC9zdmc+';

export function StoreFollowGlyph({
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
        {isFollowing ? 'Ã¢Å“â€œ' : '+'}
      </span>
    </span>
  );
}

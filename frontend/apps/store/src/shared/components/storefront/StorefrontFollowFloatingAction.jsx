import { StoreFollowGlyph } from '../../../features/shared-storefront/components/StoreFollowGlyph.jsx';

export function StorefrontFollowFloatingAction({
  enabled = false,
  followState,
  isMobileViewport = false,
  onFollow
}) {
  if (!enabled) return null;

  const isFollowing = Boolean(followState?.isFollowing);
  const isLoading = Boolean(followState?.loading);
  const followersCount = Number(followState?.followersCount || 0);

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 2090,
        left: isMobileViewport ? 10 : 'auto',
        right: isMobileViewport ? 10 : 18,
        bottom: isMobileViewport ? 78 : 84,
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end',
        flexWrap: 'wrap'
      }}
    >
      <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
        <button
          type="button"
          aria-label={isFollowing ? 'Unfollow this storefront' : 'Follow this storefront'}
          title={isFollowing ? 'Following' : 'Follow'}
          disabled={isLoading}
          onClick={onFollow}
          style={{
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            background: isFollowing ? '#ecfeff' : '#fff',
            color: '#334155',
            padding: '8px 12px',
            minHeight: 44,
            minWidth: 96,
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(15,23,42,.12)',
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <StoreFollowGlyph isFollowing={isFollowing} size={16} tone="#334155" badgeSize={14} badgeTextSize={10} />
            {isFollowing ? 'Following' : 'Follow'}
          </span>
        </button>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#64748b',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 999,
            padding: '3px 8px',
            boxShadow: '0 6px 16px rgba(15,23,42,.08)'
          }}
        >
          {followersCount} follower(s)
        </span>
      </div>
    </div>
  );
}

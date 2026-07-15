import React from 'react';
import { Clock3, Mail, MapPin, Phone } from 'lucide-react';

export function formatFollowersLabel(count) {
  const normalized = Math.max(0, Number(count || 0));
  return `${normalized} ${normalized === 1 ? 'follower' : 'followers'}`;
}

export function BrandFacebookIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5H16.8V4.8c-.3 0-1.4-.1-2.6-.1-2.6 0-4.3 1.6-4.3 4.4V11H7v3h2.9v8h3.6Z" />
    </svg>
  );
}

export function BrandMessengerIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 3C6.9 3 3 6.7 3 11.2c0 2.6 1.3 4.9 3.4 6.4V21l3.2-1.8c.8.2 1.6.3 2.4.3 5.1 0 9-3.7 9-8.2S17.1 3 12 3Zm1 11.4-2.3-2.5-4.5 2.5 5-5.3 2.4 2.5 4.4-2.5-5 5.3Z" />
    </svg>
  );
}

export function getStorefrontContactIcon(label) {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === 'call' || normalized === 'phone') {
    return <Phone size={16} />;
  }
  if (normalized === 'facebook') {
    return <BrandFacebookIcon size={16} />;
  }
  if (normalized === 'messenger' || normalized === 'message') {
    return <BrandMessengerIcon size={16} />;
  }
  if (normalized === 'email') {
    return <Mail size={16} />;
  }
  if (normalized === 'address' || normalized === 'location') {
    return <MapPin size={16} />;
  }
  if (normalized === 'hours') {
    return <Clock3 size={16} />;
  }
  return <Clock3 size={16} />;
}

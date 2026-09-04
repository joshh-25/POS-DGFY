import React from 'react';
import { Clock3, Mail, MapPin, Phone } from 'lucide-react';

import { sanitizeExternalLink } from '../../../shared/utils/externalLinks.js';

const STOREFRONT_FOOTER_SOCIAL_LABELS = ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'];
const STOREFRONT_FOOTER_CONTACT_LABELS = ['Call', 'Email'];
const DELIVERY_PARTNER_LOGOS = Object.freeze({
  grab: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSboB_YmMRIM3d5SN4mxXvUZmG5j0kbI1N2hg&s',
  foodpanda: 'https://cdn.worldvectorlogo.com/logos/foodpanda-logo.svg',
  lalamove: 'https://images.seeklogo.com/logo-png/44/1/lalamove-logo-png_seeklogo-447373.png'
});

export function formatFollowersLabel(count) {
  const normalized = Math.max(0, Number(count || 0));
  return `${normalized} ${normalized === 1 ? 'follower' : 'followers'}`;
}

export function formatRatingSummary(reviewSummary = null) {
  const score = Number(reviewSummary?.score);
  if (!Number.isFinite(score) || score <= 0) return 'New storefront';
  const count = Number(reviewSummary?.total_count ?? reviewSummary?.totalCount);
  return Number.isFinite(count) && count > 0
    ? `${score.toFixed(1)} (${count})`
    : score.toFixed(1);
}

export function getPreferredSocialContact({ messengerLink = '', facebookLink = '' } = {}) {
  const normalizedMessengerLink = String(messengerLink || '').trim();
  const normalizedFacebookLink = String(facebookLink || '').trim();
  if (normalizedMessengerLink) {
    return { label: 'Messenger', value: 'Message us', href: normalizedMessengerLink };
  }
  if (normalizedFacebookLink) {
    return { label: 'Facebook', value: 'Facebook', href: normalizedFacebookLink };
  }
  return null;
}

export function maskReviewerName(value) {
  const name = String(value || '').trim();
  if (!name) return 'Anonymous';
  const words = name.split(/\s+/).filter(Boolean);
  return words
    .map((word) => {
      if (word.length <= 2) return `${word.charAt(0)}*`;
      return `${word.slice(0, 2)}${'*'.repeat(Math.max(2, word.length - 2))}`;
    })
    .join(' ');
}

export function deriveStorefrontRegistrationYear(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return String(date.getFullYear());
}

export function getStorefrontSocialFooterLinks(links = []) {
  return (Array.isArray(links) ? links : [])
    .filter((link) => STOREFRONT_FOOTER_SOCIAL_LABELS.includes(link?.label));
}

export function getStorefrontContactFooterLinks(links = []) {
  return (Array.isArray(links) ? links : [])
    .filter((link) => STOREFRONT_FOOTER_CONTACT_LABELS.includes(link?.label));
}

export function getDeliveryPlatformLinks(deliveryPartners = []) {
  return (Array.isArray(deliveryPartners) ? deliveryPartners : [])
    .map((entry) => {
      const partner = String(entry?.partner || '').trim().toLowerCase();
      if (!partner) return null;
      const href = sanitizeExternalLink(entry?.url);
      if (!href) return null;
      return {
        partner,
        label: String(entry?.label || (partner === 'foodpanda' ? 'foodpanda' : partner.charAt(0).toUpperCase() + partner.slice(1))).trim(),
        href,
        logoUrl: DELIVERY_PARTNER_LOGOS[partner] || ''
      };
    })
    .filter(Boolean);
}

export function BrandFacebookIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="#1877F2">
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

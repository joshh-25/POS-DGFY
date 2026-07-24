import React from 'react';

import { STOREFRONT_CLOSED_TITLE } from '../model/storefrontClosedState.js';

export function StorefrontClosedNotice({
  accent = '#92400e',
  background = '#fffbeb',
  border = '#fde68a',
  body = '',
  title = STOREFRONT_CLOSED_TITLE
}) {
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background,
        color: accent,
        borderRadius: 14,
        padding: '12px 14px',
        display: 'grid',
        gap: 4
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

export function createStorefrontClosedNoticeRenderer(body) {
  return function renderStorefrontClosedNotice({
    accent = '#92400e',
    background = '#fffbeb',
    border = '#fde68a',
    title = STOREFRONT_CLOSED_TITLE
  } = {}) {
    return (
      <StorefrontClosedNotice
        accent={accent}
        background={background}
        border={border}
        body={body}
        title={title}
      />
    );
  };
}

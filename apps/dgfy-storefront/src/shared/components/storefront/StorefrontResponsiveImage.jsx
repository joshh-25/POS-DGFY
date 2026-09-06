import React from 'react';
import { ResponsiveImage } from '../../../../../../packages/web-core/src/components/media/ResponsiveImage.jsx';

// Thin adapter over the shared `ResponsiveImage` shell -- keeps this app's
// existing external prop contract (`imageSources`, not `sources`) so every
// storefront call site and test is untouched.
export function StorefrontResponsiveImage({ imageSources, ...rest }) {
  return <ResponsiveImage sources={imageSources} {...rest} />;
}

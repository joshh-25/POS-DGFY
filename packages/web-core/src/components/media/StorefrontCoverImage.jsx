import React from 'react';
import { getCoverPhotoImageStyle } from '@sieitzz/shared-constants/coverPhotoTransform';
import { ResponsiveImage } from './ResponsiveImage.jsx';

export const StorefrontCoverImage = React.memo(function StorefrontCoverImage({ transform, style, ...props }) {
  return (
    <ResponsiveImage
      {...props}
      style={{
        ...style,
        ...getCoverPhotoImageStyle(transform)
      }}
    />
  );
});

export default StorefrontCoverImage;

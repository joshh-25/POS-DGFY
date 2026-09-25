import { forwardRef } from 'react';
import { cn } from '@/lib/utils.js';
import {
  POS_PAGE_FRAME_CLASS,
  POS_PAGE_ROOT_CLASS,
  POS_PAGE_SECTION_STACK_CLASS
} from './PosPageSpacing.js';

/**
 * Shared page-level frame for the redesigned POS workspaces.
 *
 * The shell supplies sizing and scrolling; this component supplies the shared
 * semantic gutter and section rhythm for each primary workspace.
 */
const PosPageFrame = forwardRef(function PosPageFrame({
  as: Component = 'div',
  page,
  className = '',
  children,
  ...props
}, ref) {
  return (
    <Component
      {...props}
      ref={ref}
      data-pos-page-frame={page || undefined}
      className={cn(
        POS_PAGE_ROOT_CLASS,
        POS_PAGE_FRAME_CLASS,
        POS_PAGE_SECTION_STACK_CLASS,
        className
      )}
    >
      {children}
    </Component>
  );
});

PosPageFrame.displayName = 'PosPageFrame';

export default PosPageFrame;

/**
 * Shared spacing contract for the primary POS workspaces.
 *
 * Keep the page frame and major-section rhythm in one place so History,
 * Reports, Settings, and Shift do not drift as individual screens evolve. The
 * terminal shell opts these workspaces out of its generic padding so this is
 * the only owner of their page-level gutters. All use the same standard frame
 * so page spacing stays consistent across responsive breakpoints.
 */
export const POS_PAGE_ROOT_CLASS = 'min-w-0 max-w-full overflow-x-hidden';
export const POS_PAGE_FRAME_CLASS = 'px-4 py-4 sm:px-6 sm:py-4';
export const POS_PAGE_SECTION_STACK_CLASS = 'space-y-4 sm:space-y-6';
export const POS_PAGE_CONTENT_STACK_CLASS = 'flex min-w-0 max-w-full flex-col gap-4';
export const POS_MOBILE_PAGE_STACK_CLASS = 'flex flex-col gap-4';
// Keep the tab rail 16px below the shell header when stuck, matching the page-frame
// top gutter. The negative margin and padding preserve the original flow position.
export const POS_MOBILE_STICKY_TAB_ROW_CLASS = 'max-[767px]:sticky max-[767px]:top-0 max-[767px]:z-30 max-[767px]:-mt-4 max-[767px]:w-full max-[767px]:bg-white max-[767px]:pt-4';

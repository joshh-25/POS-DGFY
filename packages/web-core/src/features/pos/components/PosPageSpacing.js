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
// Keep framed workspaces on the Items tab rail's rhythm: desktop stays at 16px,
// while phone layouts add the same 8px mobile breathing room above the rail.
export const POS_PAGE_FRAME_CLASS = 'px-4 pt-2 pb-4 sm:px-6 min-[1024px]:py-4';
export const POS_PAGE_SECTION_STACK_CLASS = 'space-y-4 sm:space-y-6';
export const POS_PAGE_CONTENT_STACK_CLASS = 'flex min-w-0 max-w-full flex-col gap-4';
export const POS_MOBILE_PAGE_STACK_CLASS = 'flex flex-col gap-4';
// Keep sticky main tabs aligned to the compact 8px mobile/tablet page gutter.
// Desktop spacing remains owned by each page frame.
export const POS_MOBILE_STICKY_TAB_ROW_CLASS = 'max-[767px]:sticky max-[767px]:top-0 max-[767px]:z-30 max-[767px]:-mt-2 max-[767px]:w-full max-[767px]:bg-white max-[767px]:pt-2';

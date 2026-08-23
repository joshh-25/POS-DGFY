export const POS_UPDATE_NOTICE_EVENT = 'dgfy-pos:update-notice';

const POS_UPDATE_NOTICE_STATE_KEY = '__dgfyPosUpdateNotice';

export const readPosUpdateNoticeState = () => {
  if (typeof window === 'undefined') return null;
  return window[POS_UPDATE_NOTICE_STATE_KEY] || null;
};

export const publishPosUpdateNoticeState = (state) => {
  if (typeof window === 'undefined') return;
  window[POS_UPDATE_NOTICE_STATE_KEY] = state || null;
  window.dispatchEvent(new Event(POS_UPDATE_NOTICE_EVENT));
};

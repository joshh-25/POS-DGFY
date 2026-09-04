import { toast as sonnerToast } from 'sonner';
import { createErrorToastDeduper } from './errorToastDedupe.js';

export const IMIN_POS_FEEDBACK_EVENT = 'dgfy:imin-pos-feedback';

let sequence = 0;
const recentMessages = new Map();
const DEDUPE_WINDOW_MS = 1_500;
const posErrorToastDeduper = createErrorToastDeduper();

export const isIminWrapperRuntime = (windowObj = typeof window !== 'undefined' ? window : null) => {
  const bridge = windowObj?.iMinBridge;
  if (!bridge || typeof bridge.isIminWrapper !== 'function') return false;

  try {
    return bridge.isIminWrapper() === true;
  } catch {
    return false;
  }
};

export const IMIN_PERFORMANCE_CLASS = 'dgfy-imin-performance';

export const installIminPerformanceProfile = (
  windowObj = typeof window !== 'undefined' ? window : null
) => {
  const root = windowObj?.document?.documentElement;
  if (!root?.classList || !isIminWrapperRuntime(windowObj)) return false;

  root.classList.add(IMIN_PERFORMANCE_CLASS);
  return true;
};

export const emitIminPosFeedback = (
  {
    tone = 'info',
    message = '',
    description = '',
    duration = null,
    source = 'POS'
  } = {},
  windowObj = typeof window !== 'undefined' ? window : null
) => {
  if (!isIminWrapperRuntime(windowObj) || typeof windowObj?.dispatchEvent !== 'function') return null;

  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) return null;
  const normalizedTone = ['success', 'error', 'warning', 'info'].includes(tone) ? tone : 'info';
  const normalizedDescription = String(description || '').trim();
  const normalizedDuration = Number(duration);
  const signature = `${normalizedTone}:${normalizedMessage}:${normalizedDescription}`;
  const now = Date.now();
  const previous = recentMessages.get(signature) || 0;
  if (now - previous < DEDUPE_WINDOW_MS) return null;

  recentMessages.set(signature, now);
  windowObj.dispatchEvent(new CustomEvent(IMIN_POS_FEEDBACK_EVENT, {
    detail: {
      id: `imin-feedback-${now}-${sequence += 1}`,
      tone: normalizedTone,
      message: normalizedMessage,
      description: normalizedDescription,
      duration: Number.isFinite(normalizedDuration) && normalizedDuration > 0 ? normalizedDuration : null,
      source: String(source || 'POS').trim() || 'POS'
    }
  }));
  return signature;
};

const createToastMethod = (tone) => (message, options = {}) => {
  if (
    tone === 'error'
    && posErrorToastDeduper.shouldSuppress(`${String(message || '').trim()}:${String(options?.description || '').trim()}`)
  ) {
    return null;
  }

  if (!isIminWrapperRuntime()) {
    return sonnerToast[tone](message, options);
  }

  return emitIminPosFeedback({
    tone: tone === 'message' ? 'info' : tone,
    message,
    description: options?.description,
    duration: options?.duration,
    source: 'POS'
  });
};

// POS-only facade: preserves the Sonner call shape in browsers and routes APK feedback inline.
export const posToast = {
  success: createToastMethod('success'),
  error: createToastMethod('error'),
  warning: createToastMethod('warning'),
  info: createToastMethod('info'),
  message: createToastMethod('message'),
  dismiss: (toastId) => {
    if (!isIminWrapperRuntime()) {
      sonnerToast.dismiss(toastId);
    }
  }
};

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Inbox, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { POS_SHIFT_SECONDARY_BUTTON_CLASS } from './posShiftButtonStyles.js';

const STATE_PRESENTATION = {
  loading: {
    icon: Loader2,
    className: 'border-blue-200 bg-blue-50/70 text-[#1A4E8D]',
    iconClassName: 'text-[#1A4E8D]',
    role: 'status',
    live: 'polite'
  },
  empty: {
    icon: Inbox,
    className: 'border-slate-200 bg-slate-50 text-slate-700',
    iconClassName: 'text-slate-500',
    role: 'status',
    live: 'polite'
  },
  error: {
    icon: AlertCircle,
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    iconClassName: 'text-rose-700',
    role: 'alert',
    live: 'assertive'
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    iconClassName: 'text-amber-700',
    role: 'status',
    live: 'polite'
  },
  info: {
    icon: Info,
    className: 'border-blue-200 bg-blue-50 text-[#1A4E8D]',
    iconClassName: 'text-[#1A4E8D]',
    role: 'status',
    live: 'polite'
  },
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    iconClassName: 'text-emerald-700',
    role: 'status',
    live: 'polite'
  }
};

export default function PosShiftStateNotice({
  variant = 'empty',
  title = '',
  message = '',
  actionLabel = '',
  onAction,
  actionDisabled = false,
  compact = false,
  children = null,
  className = ''
}) {
  const presentation = STATE_PRESENTATION[variant] || STATE_PRESENTATION.empty;
  const StateIcon = presentation.icon;
  const hasAction = Boolean(actionLabel && onAction);

  return (
    <div
      role={presentation.role}
      aria-live={presentation.live}
      aria-busy={variant === 'loading' ? 'true' : undefined}
      data-testid={`pos-shift-state-${variant}`}
      className={`flex flex-col gap-3 rounded-lg border ${compact ? 'px-3 py-2 text-xs' : 'px-3 py-3 text-sm'} sm:flex-row sm:items-center sm:justify-between ${presentation.className} ${className}`.trim()}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <StateIcon
          className={`mt-0.5 h-4 w-4 shrink-0 ${presentation.iconClassName} ${variant === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          {title ? <p className="font-extrabold">{title}</p> : null}
          {message ? <p className={title ? 'mt-0.5 leading-5' : 'leading-5'}>{message}</p> : null}
          {children ? <div className={message ? 'mt-1' : ''}>{children}</div> : null}
        </div>
      </div>
      {hasAction ? (
        <Button
          type="button"
          variant="outline"
          className={`min-h-11 shrink-0 rounded-lg px-3 py-2 text-xs font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

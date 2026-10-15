import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils.js';

const actionTones = {
  primary: 'border-[#C7D9EE] text-[#1A4E8D] hover:border-[#9CBCE0] hover:bg-blue-50 hover:text-[#143F73] focus-visible:ring-[#1A4E8D]',
  warning: 'border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800 focus-visible:ring-amber-500',
  danger: 'border-red-200 text-[#DC2626] hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500'
};

/** Consistent icon-only action for POS tables and their mobile record cards. */
export default function PosTableActionButton({ icon: Icon, tone = 'primary', className, ...buttonProps }) {
  return (
    <Button
      {...buttonProps}
      type="button"
      size="icon"
      variant="outline"
      className={cn(
        'pos-table-action-button h-9 w-9 shrink-0 rounded-lg bg-white p-0 shadow-sm',
        actionTones[tone] || actionTones.primary,
        className
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </Button>
  );
}

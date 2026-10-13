import { LayoutGrid, List } from 'lucide-react';

const viewOptions = [
  { value: 'grid', label: 'Grid view', icon: LayoutGrid },
  { value: 'list', label: 'List view', icon: List }
];

export default function PosItemsViewToggle({ value, onChange, compact = false }) {
  const buttonSize = compact ? 'h-10 w-10' : 'h-8 w-8';

  return (
    <div
      role="group"
      aria-label="Items view"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
    >
      {viewOptions.map(({ value: option, label, icon: Icon }) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            title={label}
            onClick={() => onChange(option)}
            className={`${buttonSize} inline-flex shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-1 ${selected ? 'bg-[#1A4E8D] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-[#1A4E8D]'}`}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

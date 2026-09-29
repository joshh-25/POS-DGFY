export default function PosFilterCountBadge({ count = 0 }) {
    const normalizedCount = Number(count);
    if (!Number.isInteger(normalizedCount) || normalizedCount <= 0) return null;

    return (
        <span
            aria-hidden="true"
            className="dgfy-pos-filter-count-badge ml-2 grid min-w-5 place-items-center rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black leading-none text-[#1A4E8D]"
        >
            {normalizedCount}
        </span>
    );
}

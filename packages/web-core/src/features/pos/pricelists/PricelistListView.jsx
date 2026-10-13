import React from 'react';
import { Archive, Pencil, Tag, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination } from '@/components/ui/pagination';
import PosSearchField, { POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS } from '../components/PosSearchField.jsx';
import { PRICELIST_PAGE_SIZE_OPTIONS, STATUS_BADGE_CLASS, STATUS_LABEL } from './pricelistPresentation.js';

const TagPlusIcon = ({ className = '', ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M16 13h6" />
    <path d="m16.5 6.5-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l1.79-1.79" />
    <path d="M19 10v6" />
    <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
  </svg>
);

export default function PricelistListView({
  disabled,
  canManage,
  sectionId,
  pricelists,
  pagination,
  page,
  pageSize,
  searchInput,
  appliedSearch,
  listLoading,
  listError,
  publishingListId,
  onSearchChange,
  onSearchSubmit,
  onOpenCreate,
  onOpenEditor,
  onPublish,
  onOpenArchive,
  onPageChange,
  onPageSizeChange
}) {
  return (
    <div className="pos-pricelist-catalog-workspace flex min-h-0 min-w-0 flex-1 flex-col gap-3" id={sectionId}>
      <div className="flex shrink-0 items-center gap-2">
        <PosSearchField
          id="pos-pricelists-search"
          data-testid="pos-pricelists-search"
          ariaLabel="Search pricelists"
          variant="catalog"
          inputClassName={POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS}
          className="min-w-0 flex-1"
          placeholder="Name"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          onClear={() => onSearchChange('')}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSearchSubmit();
          }}
        />
        <Button
          type="button"
          disabled={disabled || !canManage}
          onClick={onOpenCreate}
          aria-label="New pricelist"
          data-testid="pos-pricelists-new-button"
          title="New pricelist"
          className="pos-items-primary-action pos-items-mobile-icon-button pos-items-mobile-primary-button h-10 w-10 shrink-0 rounded-lg border-[#1A4E8D] bg-[#1A4E8D] px-0 text-[13px] text-white shadow-none hover:bg-[#143F73] active:bg-[#143F73] sm:h-9 sm:w-auto sm:px-3"
        >
          <TagPlusIcon className="h-4 w-4 shrink-0 sm:mr-1.5" />
          <span className="hidden sm:inline">New Pricelist</span>
        </Button>
      </div>

      {listError && <p className="text-xs font-semibold text-rose-600">{listError}</p>}

      <div data-testid="pos-pricelists-content" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {listLoading ? (
          <p className="text-xs text-slate-500">Loading...</p>
        ) : pricelists.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
            {appliedSearch ? 'No pricelists match this search yet.' : 'No pricelists yet. Create one to set per-item prices for a wholesale voucher.'}
          </p>
        ) : (
          <div data-testid="pos-pricelists-results" className="dgfy-pos-scroll-region min-h-0 min-w-0 flex-1 content-start overflow-y-auto overscroll-contain pr-1 touch-pan-y space-y-2">
            {pricelists.map((row) => {
              const status = String(row.status || 'draft').toLowerCase();
              const statusLabel = STATUS_LABEL[status] || status;
              const description = String(row.description || 'Default per-item pricing rules').trim() || 'Default per-item pricing rules';
              const isArchived = status === 'archived';
              return (
                <article key={row.pricelist_id} className={`rounded-xl border border-slate-300 bg-white p-2 shadow-none ${isArchived ? 'bg-slate-50/80' : ''}`}>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pos-pricelist-card-row">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <div className={`hidden h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#EEF4FF] text-[#1A4E8D] ring-1 ring-[#D7E3F4] sm:grid pos-pricelist-card-icon ${isArchived ? 'opacity-60' : ''}`}>
                        <Tag className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5 shrink-0 text-[#1A4E8D] sm:hidden" strokeWidth={1.8} aria-hidden="true" />
                            <p className={`min-w-0 max-w-full shrink break-words text-[13px] font-black uppercase leading-tight tracking-[0.06em] ${isArchived ? 'text-slate-500' : 'text-[#0F172A]'}`}>{row.name}</p>
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE_CLASS[status] || 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-current'}`} aria-hidden="true" />
                              {statusLabel}
                            </span>
                          </div>
                          <p className={`mt-1 min-w-0 max-w-full overflow-hidden break-words line-clamp-2 text-[13px] font-bold uppercase leading-tight tracking-[0.02em] ${isArchived ? 'text-slate-500' : 'text-[#334155]'} sm:mt-0.5`}>{description}</p>
                        </div>
                        <div className="mt-1.5 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
                          <span className="inline-flex items-center rounded-lg border border-[#D7E3F4] bg-[#F4F7FD] px-2 py-0.5 text-[11px] font-bold text-[#475569]">
                            Created {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex w-full min-w-0 items-center gap-1 border-t border-slate-100 pt-2 sm:w-auto sm:flex-wrap sm:justify-end sm:gap-1.5 sm:border-t-0 sm:pt-0">
                      <Button type="button" variant="outline" className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] shadow-sm sm:w-[6.5rem] sm:flex-none sm:text-xs" onClick={() => onOpenEditor(row)}>
                        <Pencil className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> {canManage ? 'Edit items' : 'View items'}
                      </Button>
                      {status === 'draft' && (
                        <Button type="button" variant="outline" className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] shadow-sm hover:bg-[#F0F6FF] sm:w-[6.5rem] sm:flex-none sm:text-xs" disabled={disabled || !canManage || publishingListId === row.pricelist_id} onClick={() => onPublish(row)}>
                          <Upload className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> {publishingListId === row.pricelist_id ? 'Publishing...' : 'Publish'}
                        </Button>
                      )}
                      {!isArchived && (
                        <Button type="button" variant="outline" className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-rose-300 px-2 text-[11px] font-bold text-rose-600 shadow-sm hover:bg-rose-50 sm:w-[6.5rem] sm:flex-none sm:text-xs" disabled={disabled || !canManage} onClick={() => onOpenArchive(row.pricelist_id)}>
                          <Archive className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> Archive
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {!listError && (
        <GlobalPagination
          testId="pos-pricelists-pagination"
          ariaLabel="Pricelist pagination"
          currentPage={page}
          totalPages={Math.max(1, Number(pagination.total_pages || 1))}
          totalItems={Number(pagination.total || pricelists.length || 0)}
          pageSize={pageSize}
          pageSizeOptions={PRICELIST_PAGE_SIZE_OPTIONS}
          hidePageSizeSuffixOnMobile
          itemLabel="pricelists"
          loading={listLoading}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          accentColor="#1A4E8D"
          className="dgfy-pos-history-pagination-footer mt-auto shrink-0 rounded-none border-0 border-t border-slate-200 px-6 py-2.5 shadow-none"
        />
      )}
    </div>
  );
}

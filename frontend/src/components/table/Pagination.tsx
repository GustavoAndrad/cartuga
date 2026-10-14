import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Must be unique on the page - needed when more than one list is paginated at once. */
  id?: string;
  pageSizeOptions?: number[];
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const buttonClass =
  "rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-300 dark:hover:bg-neutral-800";

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  id = "page-size",
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  if (totalItems === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 sm:flex-row">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="whitespace-nowrap">
          Por página
        </label>
        <select
          id={id}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-700 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <span className="hidden sm:inline">
          · {start} a {end} de {totalItems}
        </span>
      </div>

      <span className="sm:hidden">
        {start} a {end} de {totalItems}
      </span>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
            className={buttonClass}
          >
            <ChevronLeftIcon />
          </button>
          <span className="px-2 text-neutral-700 dark:text-neutral-200">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Próxima página"
            className={buttonClass}
          >
            <ChevronRightIcon />
          </button>
        </div>
      )}
    </div>
  );
}

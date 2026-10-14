import { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;

export function usePagination<T>(items: T[], initialPageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  function setPageSize(size: number) {
    setPageSizeState(size);
    setPage(1);
  }

  return { page, setPage, pageSize, setPageSize, totalPages, pageItems, totalItems: items.length };
}

import type { ReactNode } from "react";

import { SortAscIcon, SortDescIcon, SortNeutralIcon } from "./icons";

interface SortableHeaderProps<K extends string> {
  sortKey: K;
  activeKey: K | null;
  direction: "asc" | "desc";
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}

export function SortableHeader<K extends string>({
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className = "",
  children,
}: SortableHeaderProps<K>) {
  const isActive = activeKey === sortKey;

  return (
    <th className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-neutral-50 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${isActive ? "text-neutral-900 dark:text-neutral-50" : ""}`}
      >
        {children}
        {isActive ? (
          direction === "asc" ? (
            <SortAscIcon className="h-3 w-3" />
          ) : (
            <SortDescIcon className="h-3 w-3" />
          )
        ) : (
          <SortNeutralIcon className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

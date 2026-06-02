"use client";

import { Input } from "@foglamp/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foglamp/ui/components/select";
import { TableHead } from "@foglamp/ui/components/table";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir };

/**
 * Tri-state sort for a table. Each column cycles on click:
 * unsorted → descending → ascending → unsorted. `sort` is `null` while no
 * column is active (the table falls back to its natural/default order).
 * Returned `toggle` is wired to <SortableHead>.
 */
export function useTableSort<K extends string>(
  initial: SortState<K> | null = null,
) {
  const [sort, setSort] = useState<SortState<K> | null>(initial);
  const toggle = (key: K) =>
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "desc" };
      if (s.dir === "desc") return { key, dir: "asc" };
      return null; // was ascending → clear sorting
    });
  return { sort, toggle, setSort };
}

/** Stable client-side sort: nulls always sort last, numbers numerically, and
 * everything else lexicographically. A `null` sort leaves the rows in their
 * original order. Use for full-list tables (the server sorts the paginated
 * ones). */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  accessors: Record<K, (row: T) => string | number | null | undefined>,
): T[] {
  if (!sort) return [...rows];
  const get = accessors[sort.key];
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

/** A header cell that cycles its column's sort on click (desc → asc → off),
 * with a direction arrow that brightens while the column is active. */
export function SortableHead<K extends string>({
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
  children,
}: {
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort?.key === sortKey;
  const Arrow = active
    ? sort.dir === "asc"
      ? IconArrowUp
      : IconArrowDown
    : IconArrowsSort;
  return (
    <TableHead align={align} className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "group inline-flex cursor-pointer select-none items-center gap-1 text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        <Arrow
          className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
          stroke={1.5}
        />
        <span>{children}</span>
      </button>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Filter toolbar
// ---------------------------------------------------------------------------

/** A horizontal bar of filter controls, sitting above a table. Wraps on narrow
 * widths. */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** A compact search field with a leading icon and a clear button. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-56", className)}>
      <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/60" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 rounded-full px-8 dark:bg-input/20"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground"
        >
          <IconX className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** A pill that toggles a boolean filter on/off (e.g. "Errors only"). */
export function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : "text-muted-foreground hover:text-foreground dark:bg-input/20",
      )}
    >
      {children}
    </button>
  );
}

/** A compact dropdown filter with an "All" reset option (empty string). Sized to
 * match the other toolbar controls. */
export function FilterSelect<T extends string>({
  value,
  onChange,
  allLabel,
  options,
  className,
}: {
  value: T | "";
  onChange: (value: T | "") => void;
  /** Label for the reset option and the empty-state placeholder, e.g. "Any status". */
  allLabel: string;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <Select<T | "", false>
      value={value}
      onValueChange={(v) => onChange(v ?? "")}
    >
      <SelectTrigger
        size="sm"
        className={cn("rounded-full dark:bg-input/20", className)}
      >
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Debounces a rapidly-changing value (e.g. a search box) so server-backed
 * tables don't refetch on every keystroke. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Convenience: debounced-free filter for a free-text search over one or more
 * string fields of a row. Case-insensitive substring match. */
export function useTextFilter<T>(
  rows: readonly T[],
  query: string,
  fields: (row: T) => (string | null | undefined)[],
): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...rows];
    return rows.filter((row) =>
      fields(row).some((f) => f?.toLowerCase().includes(q)),
    );
    // `fields` is a stable inline accessor; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query]);
}

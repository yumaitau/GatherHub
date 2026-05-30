import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  searchPlaceholder?: string;
  /** Function that returns a stable id per row (used for keys). */
  getRowId?: (row: T, index: number) => string;
  /** Hide global search bar (when caller renders its own). */
  hideSearch?: boolean;
  /** Hide pagination footer (use when small dataset). */
  hidePagination?: boolean;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  /** Extra controls to render in the toolbar (right of search). */
  toolbar?: React.ReactNode;
  /** Show this when filtered/raw data is empty. */
  emptyState?: React.ReactNode;
  /** Custom filter fn (defaults to substring match on every visible cell). */
  filterFn?: (row: T, query: string) => boolean;
  /** Surface (border + bg) chrome around the table. Default true. */
  surface?: boolean;
}

/**
 * Generic data table primitive built on TanStack Table. Provides:
 * - Global search input (case-insensitive substring by default)
 * - Sortable column headers (click to toggle asc → desc → off)
 * - Pagination footer with page-size selector
 * - First/prev/next/last navigation
 *
 * Column definitions follow TanStack's `ColumnDef` shape; pass `id` or
 * `accessorKey` to opt rows into sort/filter.
 */
export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Search",
  getRowId,
  hideSearch,
  hidePagination,
  defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  toolbar,
  emptyState,
  filterFn,
  surface = true,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      pagination: { pageIndex: 0, pageSize: defaultPageSize },
    },
    enableGlobalFilter: !hideSearch || Boolean(filterFn),
    enableMultiSort: false,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: hidePagination ? undefined : getPaginationRowModel(),
    getRowId: getRowId,
    globalFilterFn: filterFn
      ? (row, _columnId, filterValue) =>
          filterFn(row.original as T, String(filterValue ?? ""))
      : (row, _columnId, filterValue) => {
          const q = String(filterValue ?? "")
            .toLowerCase()
            .trim();
          if (!q) return true;
          const haystack = row
            .getAllCells()
            .map((c) => {
              const v = c.getValue();
              if (v == null) return "";
              if (typeof v === "string" || typeof v === "number")
                return String(v);
              return JSON.stringify(v);
            })
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        },
  });

  const rowCount = table.getFilteredRowModel().rows.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const pageCount = table.getPageCount();
  const rangeStart = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min(rowCount, (pageIndex + 1) * pageSize);

  const wrapperClass = surface
    ? "rounded-md border border-hairline bg-surface overflow-hidden"
    : "";

  return (
    <section className={wrapperClass}>
      {(!hideSearch || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-hairline">
          {!hideSearch && (
            <div className="relative w-full max-w-xs">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-quiet pointer-events-none"
                aria-hidden="true"
              />
              <Input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8"
              />
            </div>
          )}
          {toolbar}
          <span className="ml-auto text-caption text-ink-quiet">
            <span data-numeric className="font-medium text-ink-soft">
              {rowCount}
            </span>{" "}
            {rowCount === 1 ? "result" : "results"}
          </span>
        </div>
      )}

      {rowCount === 0 ? (
        (emptyState ?? (
          <div className="px-5 py-10 text-center text-body text-ink-quiet">
            No matches.
          </div>
        ))
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const meta =
                    (header.column.columnDef.meta as
                      | { numeric?: boolean; className?: string }
                      | undefined) ?? {};
                  return (
                    <TableHead
                      key={header.id}
                      numeric={meta.numeric}
                      className={cn(meta.className)}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-ink-soft",
                            "focus-visible:outline-none focus-visible:shadow-focus rounded-xs",
                          )}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUp className="h-3 w-3 opacity-0 group-hover:opacity-30" />
                          )}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const meta =
                    (cell.column.columnDef.meta as
                      | { numeric?: boolean; className?: string }
                      | undefined) ?? {};
                  return (
                    <TableCell
                      key={cell.id}
                      numeric={meta.numeric}
                      className={cn(meta.className)}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {!hidePagination && rowCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-hairline bg-surface-sunk/30">
          <span className="text-caption text-ink-quiet">
            <span data-numeric>{rangeStart}</span>
            {"–"}
            <span data-numeric>{rangeEnd}</span>
            {" of "}
            <span data-numeric>{rowCount}</span>
          </span>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-caption text-ink-quiet">
              Rows per page
              <Select
                value={String(pageSize)}
                onValueChange={(v) => table.setPageSize(Number(v))}
              >
                <SelectTrigger className="h-8 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.setPageIndex(0)}
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-caption text-ink-quiet px-2">
                Page{" "}
                <span data-numeric className="font-medium text-ink-soft">
                  {pageIndex + 1}
                </span>{" "}
                of{" "}
                <span data-numeric className="font-medium text-ink-soft">
                  {Math.max(1, pageCount)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!table.getCanNextPage()}
                onClick={() => table.setPageIndex(pageCount - 1)}
                aria-label="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

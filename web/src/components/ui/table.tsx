import * as React from "react";
import { cn } from "@/lib/utils";

// Tables are committee work surface (DESIGN.md §5). Hairline dividers,
// paper rows, surface-sunk hover, no zebra. Numeric cells right-align via
// the `numeric` prop on TableCell/TableHead.
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn(
        "w-full caption-bottom text-body text-ink",
        "border-separate border-spacing-0",
        className,
      )}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-paper [&_tr]:border-0 [&_th]:border-b [&_th]:border-hairline",
      "sticky top-0 z-10",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      "[&_tr:not(:last-child)>td]:border-b [&_tr>td]:border-hairline",
      className,
    )}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "group/row bg-paper",
      "transition-colors duration-fast ease-out",
      "hover:bg-surface-sunk/70",
      "data-[state=selected]:bg-primary-wash data-[state=selected]:hover:bg-primary-wash",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

interface TableCellPropsBase {
  numeric?: boolean;
}

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & TableCellPropsBase
>(({ className, numeric, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-9 px-4 align-middle text-label text-ink-quiet",
      "first:pl-5 last:pr-5",
      numeric ? "text-right tabular-nums" : "text-left",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & TableCellPropsBase
>(({ className, numeric, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "h-11 px-4 align-middle text-body",
      "first:pl-5 last:pr-5",
      numeric ? "text-right tabular-nums font-medium" : "text-left",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-3 text-caption text-ink-quiet", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};

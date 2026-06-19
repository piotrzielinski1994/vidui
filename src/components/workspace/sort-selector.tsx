import { ArrowDownAZ, ArrowUpAZ, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/components/workspace/workspace-context";
import type { SortField } from "@/components/workspace/sort-natural";

const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "type", label: "Type" },
];

export function SortSelector() {
  const { sortKeys, sortDirection, toggleSortKey, toggleSortDirection } =
    useWorkspace();

  const summary =
    sortKeys.length === 0
      ? "Sort by"
      : `Sort: ${sortKeys
          .map((key) => SORT_FIELDS.find((f) => f.field === key)?.label ?? key)
          .join(", ")}`;

  const isDescending = sortDirection === "desc";
  const DirectionIcon = isDescending ? ArrowDownAZ : ArrowUpAZ;

  return (
    <div className="ml-auto flex h-full min-w-0 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Sort by"
            className="flex h-full min-w-0 items-center justify-between gap-2 border-l border-l-border px-3 text-xs outline-none hover:bg-accent focus:outline-none focus-visible:ring-0"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel>Sort fields</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SORT_FIELDS.map(({ field, label }) => (
            <DropdownMenuCheckboxItem
              key={field}
              checked={sortKeys.includes(field)}
              onCheckedChange={() => toggleSortKey(field)}
            >
              {label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon"
        aria-label={isDescending ? "Descending" : "Ascending"}
        onClick={() => toggleSortDirection()}
      >
        <DirectionIcon className="size-4" />
      </Button>
    </div>
  );
}

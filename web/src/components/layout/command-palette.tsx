/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "react-router-dom";
import {
  Search,
  ArrowRight,
  LayoutDashboard,
  Users,
  Shield,
  CalendarDays,
  Megaphone,
  Package,
  HandHeart,
  Building2,
  Newspaper,
  Settings,
  UserCircle,
  GraduationCap,
  ClipboardCheck,
} from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useGatherHub } from "@/lib/gatherhub";
import type { Role } from "@/lib/roles";
import type { Capability } from "@/lib/capabilities";
import {
  moduleEnabled,
  term,
  titleCase,
  type OrganizationModuleKey,
  type VerticalOrgConfig,
} from "@/lib/verticals";

type IconType = React.ComponentType<{ className?: string }>;

interface PaletteEntry {
  id: string;
  label: string;
  hint?: string;
  icon: IconType;
  group: "Jump to" | "Operations" | "Club" | "Account";
  to: string;
  minRole?: Role;
  capability?: Capability;
  module?: OrganizationModuleKey;
  keywords?: string[];
}

function buildEntries(org: VerticalOrgConfig | null): PaletteEntry[] {
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      group: "Jump to",
      to: "/",
      keywords: ["home", "overview"],
    },
    {
      id: "members",
      label: titleCase(term(org, "memberPlural")),
      icon: Users,
      group: "Operations",
      to: "/members",
      module: "people",
      capability: "members.read",
      keywords: ["people", "players", "parents", term(org, "memberPlural")],
    },
    {
      id: "teams",
      label: titleCase(term(org, "teamPlural")),
      icon: Shield,
      group: "Operations",
      to: "/teams",
      module: "teams",
      capability: "teams.read",
      keywords: ["squad", "roster", term(org, "teamPlural")],
    },
    {
      id: "events",
      label: titleCase(term(org, "eventPlural")),
      icon: CalendarDays,
      group: "Operations",
      to: "/events",
      module: "events",
      capability: "events.read",
      keywords: ["training", "match", "calendar", term(org, "eventPlural")],
    },
    {
      id: "sport-fixtures",
      label: "Fixtures",
      icon: CalendarDays,
      group: "Operations",
      to: "/sport/fixtures",
      module: "sport",
      capability: "events.read",
      keywords: ["matches", "draw", "schedule", "ladder", "competition"],
    },
    {
      id: "sport-match-day",
      label: "Match day",
      icon: ClipboardCheck,
      group: "Operations",
      to: "/sport/match-day",
      module: "sport",
      capability: "events.read",
      keywords: ["roster", "lineup", "bench", "interchange", "positions"],
    },
    {
      id: "announcements",
      label: "Announcements",
      icon: Megaphone,
      group: "Operations",
      to: "/announcements",
      module: "announcements",
      capability: "announcements.write",
      keywords: ["notice", "broadcast"],
    },
    {
      id: "assets",
      label: titleCase(term(org, "assetPlural")),
      icon: Package,
      group: "Operations",
      to: "/assets",
      module: "assets",
      capability: "assets.read",
      keywords: [
        "kit",
        "assets",
        "items",
        "equipment",
        "inventory",
        "history",
        "audit",
        "checked out",
        "track",
        term(org, "assetPlural"),
      ],
    },
    {
      id: "volunteers",
      label: titleCase(term(org, "volunteerPlural")),
      icon: HandHeart,
      group: "Operations",
      to: "/volunteers",
      module: "volunteers",
      capability: "volunteers.manage",
      keywords: ["roster", "duty", "certifications"],
    },
    {
      id: "training-certifications",
      label: `Training & ${titleCase(term(org, "certificationPlural"))}`,
      icon: GraduationCap,
      group: "Operations",
      to: "/training-certifications",
      module: "training",
      capability: "training.manage",
      keywords: ["certifications", "checks", "licences", "qualifications"],
    },
    {
      id: "task-board",
      label: titleCase(term(org, "taskPlural")),
      icon: ClipboardCheck,
      group: "Operations",
      to: "/tasks",
      module: "tasks",
      capability: "tasks.manage",
      keywords: ["kanban", "tasks", "deadlines", "reminders"],
    },
    {
      id: "sponsors",
      label: titleCase(term(org, "sponsorPlural")),
      icon: Building2,
      group: "Club",
      to: "/sponsors",
      module: "sponsors",
      capability: "sponsors.manage",
      keywords: ["partner", "donor"],
    },
    {
      id: "news",
      label: titleCase(term(org, "newsPlural")),
      icon: Newspaper,
      group: "Club",
      to: "/news",
      module: "news",
      capability: "news.manage",
      keywords: ["articles", "stories", "public site"],
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      group: "Account",
      to: "/settings",
      capability: "settings.admin",
      keywords: ["preferences", "organisation settings", "permissions"],
    },
    {
      id: "profile",
      label: "Your profile",
      icon: UserCircle,
      group: "Account",
      to: "/profile",
      keywords: ["account", "me"],
    },
  ];
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = React.createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    return {
      open: false,
      setOpen: () => undefined,
      toggle: () => undefined,
    };
  }
  return ctx;
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <Ctx.Provider value={{ open, setOpen, toggle }}>
      {children}
      <CommandPaletteDialog open={open} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

function matches(query: string, entry: PaletteEntry): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (entry.label.toLowerCase().includes(q)) return true;
  if (entry.hint?.toLowerCase().includes(q)) return true;
  if (entry.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
  return false;
}

function CommandPaletteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { can, hasCapability, org } = useGatherHub();
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const entries = React.useMemo(() => buildEntries(org), [org]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const visible = React.useMemo(
    () =>
      entries.filter(
        (e) =>
          (!e.minRole || can(e.minRole)) &&
          (!e.capability || hasCapability(e.capability)) &&
          (!e.module || moduleEnabled(org, e.module)) &&
          matches(query, e),
      ),
    [entries, query, can, hasCapability, org],
  );

  React.useEffect(() => {
    if (activeIndex >= visible.length) setActiveIndex(0);
  }, [visible.length, activeIndex]);

  function go(entry: PaletteEntry) {
    navigate(entry.to);
    onOpenChange(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, visible.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = visible[activeIndex];
      if (entry) go(entry);
    }
  }

  const grouped = React.useMemo(() => {
    const map = new Map<string, PaletteEntry[]>();
    for (const entry of visible) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return map;
  }, [visible]);

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-ink-strong/30 backdrop-blur-[1.5px]",
            "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-[15vh] z-50 -translate-x-1/2 w-[calc(100vw-32px)] max-w-[640px]",
            "rounded-md border border-hairline bg-popover text-popover-foreground",
            "shadow-dialog overflow-hidden",
            "data-[state=open]:animate-overlay-in",
            "focus:outline-none",
          )}
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">
            Search and jump
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Type to filter routes and actions, then press Enter.
          </DialogPrimitive.Description>
          <div className="flex items-center gap-3 px-3 h-12 border-b border-hairline">
            <Search
              className="h-4 w-4 text-ink-quiet shrink-0"
              aria-hidden="true"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder="Search or jump to anything"
              className={cn(
                "flex-1 bg-transparent outline-none text-body text-ink placeholder:text-ink-quiet",
              )}
              aria-label="Search GatherHub"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div
            ref={listRef}
            role="listbox"
            aria-label="Results"
            className="max-h-[60vh] overflow-y-auto p-2"
          >
            {visible.length === 0 ? (
              <div className="px-3 py-10 text-center text-body text-ink-quiet">
                No matches for &ldquo;{query}&rdquo;.
              </div>
            ) : (
              [...grouped.entries()].map(([group, entries]) => (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="px-2 pt-2 pb-1 text-label text-ink-quiet">
                    {group}
                  </div>
                  {entries.map((entry) => {
                    const index = visible.indexOf(entry);
                    const isActive = index === activeIndex;
                    const Icon = entry.icon;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        data-index={index}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => go(entry)}
                        className={cn(
                          "group/row flex w-full items-center gap-3 rounded-sm px-2 h-10",
                          "text-body text-ink",
                          "transition-colors duration-fast ease-out",
                          isActive && "bg-primary-wash",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-primary" : "text-ink-soft",
                          )}
                          aria-hidden="true"
                        />
                        <span className="flex-1 text-left truncate font-semi">
                          {entry.label}
                        </span>
                        {entry.hint && (
                          <span className="text-caption text-ink-quiet">
                            {entry.hint}
                          </span>
                        )}
                        <ArrowRight
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-ink-quiet",
                            isActive ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-3 px-3 py-2 border-t border-hairline bg-surface-sunk/40 text-caption text-ink-quiet">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              <span>open</span>
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function CommandPaletteTrigger({ className }: { className?: string }) {
  const { setOpen } = useCommandPalette();
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "inline-flex items-center gap-2.5 h-8 px-2.5 w-full max-w-[360px]",
        "rounded-sm border border-hairline bg-surface",
        "text-caption text-ink-quiet",
        "transition-[background-color,border-color,color] duration-fast ease-out",
        "hover:bg-surface-sunk hover:border-border-strong hover:text-ink-soft",
        "focus-visible:outline-none focus-visible:shadow-focus",
        className,
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left truncate">Search or jump to</span>
      <span className="flex items-center gap-1">
        <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

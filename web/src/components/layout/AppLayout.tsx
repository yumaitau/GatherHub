import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import {
  LayoutDashboard,
  Users,
  Shield,
  CalendarDays,
  Megaphone,
  Package,
  ScanLine,
  HandHeart,
  Building2,
  Newspaper,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useGatherHub } from "@/lib/gatherhub";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/shared";
import { NoOrganisation, AuthErrorBoundary } from "@/components/AccessDenied";
import {
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from "@/components/layout/command-palette";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { Role } from "@/lib/roles";

type IconType = React.ComponentType<{ className?: string }>;

interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  shortcut?: string;
  minRole?: Role;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        shortcut: "D",
        end: true,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/members", label: "Members", icon: Users, shortcut: "M" },
      { to: "/teams", label: "Teams", icon: Shield, shortcut: "T" },
      { to: "/events", label: "Events", icon: CalendarDays, shortcut: "E" },
      { to: "/announcements", label: "Announcements", icon: Megaphone },
      { to: "/assets", label: "KitTrace", icon: Package, shortcut: "K" },
      { to: "/assets/scan", label: "Scan", icon: ScanLine },
      { to: "/volunteers", label: "Volunteers", icon: HandHeart },
    ],
  },
  {
    label: "Club",
    items: [
      {
        to: "/sponsors",
        label: "Sponsors",
        icon: Building2,
        minRole: "committee",
      },
      { to: "/news", label: "News", icon: Newspaper, minRole: "committee" },
    ],
  },
];

const SYSTEM_NAV: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings, minRole: "admin" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </CommandPaletteProvider>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { isLoading, isSignedInToOrg, org, can } = useGatherHub();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header
        className={cn(
          "sticky top-0 z-30 flex h-13 items-center gap-3 px-4",
          "border-b border-hairline bg-paper/95 backdrop-blur-[2px]",
        )}
      >
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation"
          className={cn(
            "md:hidden inline-flex h-8 w-8 items-center justify-center",
            "rounded-sm text-ink-soft hover:text-ink hover:bg-surface-sunk",
            "transition-colors duration-fast ease-out",
            "focus-visible:outline-none focus-visible:shadow-focus",
          )}
        >
          {mobileOpen ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Menu className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <Wordmark />

        <div className="hidden md:block h-5 w-px bg-hairline mx-1" aria-hidden="true" />

        <OrgSwitcher />

        <div className="ml-auto flex items-center gap-2 md:ml-6 md:flex-1 md:justify-end">
          <div className="hidden md:flex md:flex-1 md:max-w-[360px] md:mr-auto md:ml-4">
            <CommandPaletteTrigger />
          </div>
          <ThemeToggle />
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "h-7 w-7 ring-0",
                userButtonPopoverCard:
                  "rounded-md border border-hairline shadow-popover",
              },
            }}
          />
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed top-13 bottom-0 left-0 z-20 w-sidebar",
            "border-r border-hairline bg-surface-sunk",
            "transition-transform duration-base ease-out",
            "md:sticky md:top-13 md:bottom-auto md:h-[calc(100vh-3.25rem)]",
            "md:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-full flex-col overflow-y-auto px-2 pt-3 pb-4">
            {NAV.map((group) => (
              <NavSection key={group.label} group={group} can={can} />
            ))}
            <div className="mt-auto pt-4">
              {SYSTEM_NAV.filter((n) => !n.minRole || can(n.minRole)).map(
                (item) => (
                  <NavRow key={item.to} item={item} />
                ),
              )}
            </div>
          </div>
        </aside>

        {/* Mobile backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-10 bg-ink-strong/30 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-[1280px] px-5 py-7 md:px-8 md:py-9">
            {isLoading ? (
              <LoadingState label="Loading your organisation…" />
            ) : !isSignedInToOrg || !org ? (
              <NoOrganisation />
            ) : (
              <AuthErrorBoundary>{children}</AuthErrorBoundary>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavSection({
  group,
  can,
}: {
  group: NavGroup;
  can: (role: Role) => boolean;
}) {
  const items = group.items.filter((n) => !n.minRole || can(n.minRole));
  if (items.length === 0) return null;
  return (
    <div className="mb-1.5">
      <div className="px-3 pt-3 pb-1.5 text-label text-ink-quiet">
        {group.label}
      </div>
      {items.map((item) => (
        <NavRow key={item.to} item={item} />
      ))}
    </div>
  );
}

function NavRow({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "group/nav flex items-center gap-2.5 mx-1 my-[1px] rounded-sm h-8 px-2.5",
          "text-body text-ink-soft",
          "transition-colors duration-fast ease-out",
          "hover:bg-paper hover:text-ink",
          "focus-visible:outline-none focus-visible:shadow-focus",
          isActive &&
            "bg-paper text-ink-strong font-semi border border-hairline",
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden="true" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.shortcut && (
        <kbd
          className={cn(
            "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1",
            "rounded-xs border border-hairline bg-paper",
            "text-label text-ink-quiet",
            "opacity-0 group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100",
            "transition-opacity duration-fast ease-out",
          )}
          aria-hidden="true"
        >
          {item.shortcut}
        </kbd>
      )}
    </NavLink>
  );
}

function Wordmark() {
  return (
    <a
      href="/"
      className={cn(
        "inline-flex items-center gap-2 shrink-0",
        "text-ink-strong",
        "focus-visible:outline-none focus-visible:shadow-focus rounded-sm",
      )}
      aria-label="GatherHub home"
    >
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        className="h-6 w-6 shrink-0"
      />
      <span className="hidden sm:inline text-body-strong tracking-[-0.012em]">
        GatherHub
      </span>
    </a>
  );
}

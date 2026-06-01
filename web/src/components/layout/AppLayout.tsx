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
  HandHeart,
  Building2,
  Newspaper,
  Settings,
  Menu,
  X,
  ClipboardList,
  ClipboardCheck,
  Gauge,
  Trophy,
  Layers,
  Layers3,
  UserCog,
  Award,
  GraduationCap,
  ChevronRight,
} from "lucide-react";
import { useGatherHub } from "@/lib/gatherhub";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/shared";
import {
  NoOrganisation,
  MobileAppOnly,
  AuthErrorBoundary,
} from "@/components/AccessDenied";
import {
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from "@/components/layout/command-palette";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { Role } from "@/lib/roles";
import type { Capability } from "@/lib/capabilities";
import {
  legacySoccerSurfacesEnabled,
  moduleEnabled,
  term,
  titleCase,
  type OrganizationModuleKey,
  type VerticalOrgConfig,
} from "@/lib/verticals";

type IconType = React.ComponentType<{ className?: string }>;

interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  shortcut?: string;
  minRole?: Role;
  capability?: Capability;
  module?: OrganizationModuleKey;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
}

function buildNav(org: VerticalOrgConfig | null): NavGroup[] {
  const groups: NavGroup[] = [
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
        {
          to: "/members",
          label: titleCase(term(org, "memberPlural")),
          icon: Users,
          shortcut: "M",
          module: "people",
          capability: "members.read",
        },
        {
          to: "/teams",
          label: titleCase(term(org, "teamPlural")),
          icon: Shield,
          shortcut: "T",
          module: "teams",
          capability: "teams.read",
        },
        {
          to: "/events",
          label: titleCase(term(org, "eventPlural")),
          icon: CalendarDays,
          shortcut: "E",
          module: "events",
          capability: "events.read",
        },
        {
          to: "/announcements",
          label: "Announcements",
          icon: Megaphone,
          module: "announcements",
          capability: "announcements.write",
        },
        {
          to: "/assets",
          label: titleCase(term(org, "assetPlural")),
          icon: Package,
          shortcut: "K",
          module: "assets",
          capability: "assets.read",
        },
        {
          to: "/volunteers",
          label: titleCase(term(org, "volunteerPlural")),
          icon: HandHeart,
          module: "volunteers",
          capability: "volunteers.manage",
        },
        {
          to: "/training-certifications",
          label: `Training & ${titleCase(term(org, "certificationPlural"))}`,
          icon: GraduationCap,
          module: "training",
          capability: "training.manage",
        },
        {
          to: "/tasks",
          label: titleCase(term(org, "taskPlural")),
          icon: ClipboardCheck,
          module: "tasks",
          capability: "tasks.manage",
        },
      ],
    },
    {
      label: titleCase(term(org, "orgSingular")),
      items: [
        {
          to: "/lifetime-members",
          label: `Lifetime ${titleCase(term(org, "memberPlural"))}`,
          icon: Award,
          module: "people",
          capability: "members.read",
        },
        {
          to: "/sponsors",
          label: titleCase(term(org, "sponsorPlural")),
          icon: Building2,
          module: "sponsors",
          capability: "sponsors.manage",
        },
        {
          to: "/news",
          label: titleCase(term(org, "newsPlural")),
          icon: Newspaper,
          module: "news",
          capability: "news.manage",
        },
      ],
    },
  ];
  if (moduleEnabled(org, "sport") || legacySoccerSurfacesEnabled(org)) {
    groups.push(buildSportNav(org));
  }
  return groups;
}

function buildSportNav(org: VerticalOrgConfig | null): NavGroup {
  return {
    label: titleCase(term(org, "sportSingular")),
    collapsible: true,
    defaultOpen: false,
    items: [
      {
        to: "/sport/fixtures",
        label: "Fixtures",
        icon: CalendarDays,
        module: "sport",
        capability: "events.read",
      },
      {
        to: "/sport/match-day",
        label: "Match day",
        icon: ClipboardCheck,
        module: "sport",
        capability: "events.read",
      },
      {
        to: "/sport/registrations",
        label: titleCase(term(org, "registrationPlural")),
        icon: ClipboardList,
        module: "soccer",
        capability: "soccer.manage",
      },
      {
        to: "/sport/coaches-managers",
        label: "Coaches & Managers",
        icon: UserCog,
        module: "soccer",
        capability: "soccer.manage",
      },
      {
        to: "/sport/competitions",
        label: titleCase(term(org, "competitionPlural")),
        icon: Trophy,
        module: "soccer",
        capability: "soccer.manage",
      },
      {
        to: "/sport/age-groups",
        label: titleCase(term(org, "ageGroupPlural")),
        icon: Layers3,
        module: "soccer",
        capability: "soccer.manage",
      },
      {
        to: "/sport/divisions",
        label: titleCase(term(org, "divisionPlural")),
        icon: Layers,
        module: "soccer",
        capability: "soccer.manage",
      },
      {
        to: "/sport/grading",
        label: titleCase(term(org, "gradingSingular")),
        icon: Gauge,
        module: "soccer",
        capability: "soccer.grade",
      },
    ],
  };
}

const SYSTEM_NAV: NavItem[] = [
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    capability: "settings.admin",
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </CommandPaletteProvider>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { isLoading, isSignedInToOrg, org, role, can, hasCapability } =
    useGatherHub();
  const groups = buildNav(org);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const hasWebAccess = !role || can("volunteer");
  const showNavigation = Boolean(isSignedInToOrg && org && hasWebAccess);

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
          disabled={!showNavigation}
          aria-label="Toggle navigation"
          className={cn(
            "md:hidden inline-flex h-8 w-8 items-center justify-center",
            "rounded-sm text-ink-soft hover:text-ink hover:bg-surface-sunk",
            "transition-colors duration-fast ease-out",
            "focus-visible:outline-none focus-visible:shadow-focus",
            !showNavigation && "invisible pointer-events-none",
          )}
        >
          {mobileOpen ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Menu className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <Wordmark />

        <div
          className="hidden md:block h-5 w-px bg-hairline mx-1"
          aria-hidden="true"
        />

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
        {showNavigation && (
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
              {groups.map((group) => (
                <NavSection
                  key={group.label}
                  group={group}
                  can={can}
                  hasCapability={hasCapability}
                  org={org}
                />
              ))}
              <div className="mt-auto pt-4">
                {SYSTEM_NAV.filter(
                  (n) =>
                    (!n.minRole || can(n.minRole)) &&
                    (!n.capability || hasCapability(n.capability)),
                ).map((item) => (
                  <NavRow key={item.to} item={item} />
                ))}
              </div>
            </div>
          </aside>
        )}

        {mobileOpen && showNavigation && (
          <div
            className="fixed inset-0 z-10 bg-ink-strong/30 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-[1280px] px-5 py-7 md:px-8 md:py-9">
            {isLoading ? (
              <LoadingState label="Loading your organisation…" />
            ) : !isSignedInToOrg || !org ? (
              <NoOrganisation />
            ) : !hasWebAccess ? (
              <MobileAppOnly />
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
  hasCapability,
  org,
}: {
  group: NavGroup;
  can: (role: Role) => boolean;
  hasCapability: (capability: Capability) => boolean;
  org: VerticalOrgConfig | null;
}) {
  const items = group.items.filter(
    (n) =>
      (!n.minRole || can(n.minRole)) &&
      (!n.capability || hasCapability(n.capability)) &&
      (!n.module || moduleEnabled(org, n.module)),
  );
  const location = useLocation();
  const hasActive = items.some((i) =>
    i.end
      ? location.pathname === i.to
      : location.pathname === i.to || location.pathname.startsWith(i.to + "/"),
  );
  const storageKey = `gh.nav.section.${group.label}`;
  const [open, setOpen] = React.useState<boolean>(() => {
    if (!group.collapsible) return true;
    if (typeof window === "undefined") return group.defaultOpen ?? false;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return group.defaultOpen ?? false;
  });
  React.useEffect(() => {
    if (group.collapsible && hasActive) setOpen(true);
  }, [group.collapsible, hasActive]);
  React.useEffect(() => {
    if (!group.collapsible) return;
    window.localStorage.setItem(storageKey, open ? "1" : "0");
  }, [open, group.collapsible, storageKey]);

  if (items.length === 0) return null;

  if (!group.collapsible) {
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

  return (
    <div className="mb-1.5 mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? "Hide section" : "Show section"}
        className={cn(
          "group/sec w-full flex items-center gap-2 mx-1 h-8 px-2.5 rounded-sm",
          "border border-hairline bg-paper",
          "text-body-strong text-ink-strong",
          "transition-colors duration-fast ease-out",
          "hover:bg-surface-sunk hover:border-ink-soft/30",
          "focus-visible:outline-none focus-visible:shadow-focus",
          "cursor-pointer",
        )}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-ink-soft",
            "transition-transform duration-fast ease-out",
            open && "rotate-90",
            "group-hover/sec:text-ink-strong",
          )}
          aria-hidden="true"
        />
        <span className="flex-1 text-left tracking-[-0.005em]">
          {group.label}
        </span>
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5",
            "rounded-xs bg-surface-sunk text-label text-ink-quiet",
            "group-hover/sec:bg-paper group-hover/sec:text-ink-soft",
            "transition-colors duration-fast ease-out",
          )}
          aria-hidden="true"
          data-numeric
        >
          {items.length}
        </span>
        <span
          className={cn(
            "text-caption text-ink-quiet",
            "group-hover/sec:text-ink-soft",
            "transition-colors duration-fast ease-out",
          )}
        >
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="mt-1">
          {items.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </div>
      )}
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

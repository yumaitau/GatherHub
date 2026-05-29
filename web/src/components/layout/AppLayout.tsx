import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { OrganizationSwitcher, UserButton } from "@clerk/clerk-react";
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
import { LoadingState, EmptyState } from "@/components/shared";
import type { Role } from "@/lib/roles";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole?: Role;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/members", label: "Members", icon: Users },
  { to: "/teams", label: "Teams", icon: Shield },
  { to: "/events", label: "Events", icon: CalendarDays },
  { to: "/announcements", label: "Announcements", icon: Megaphone },
  { to: "/assets", label: "KitTrace", icon: Package },
  { to: "/assets/scan", label: "Scan", icon: ScanLine },
  { to: "/volunteers", label: "Volunteers", icon: HandHeart },
  { to: "/sponsors", label: "Sponsors", icon: Building2, minRole: "committee" },
  { to: "/news", label: "News", icon: Newspaper, minRole: "committee" },
  { to: "/settings", label: "Settings", icon: Settings, minRole: "admin" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isSignedInToOrg, org, can } = useGatherHub();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4">
        <button
          className="md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
        <div className="flex items-center gap-2 font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground text-sm">
            G
          </span>
          <span className="hidden sm:inline">GatherHub</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
          />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-14 left-0 z-20 w-60 border-r bg-background p-3 transition-transform md:static md:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <nav className="flex flex-col gap-1">
            {NAV.filter((n) => !n.minRole || can(n.minRole)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 p-4 md:p-8 min-w-0">
          {isLoading ? (
            <LoadingState label="Loading your club…" />
          ) : !isSignedInToOrg || !org ? (
            <NoOrgState />
          ) : (
            <div className="mx-auto max-w-6xl">{children}</div>
          )}
        </main>
      </div>
    </div>
  );
}

function NoOrgState() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyState
        icon={Building2}
        title="Select or create a club"
        description="GatherHub organises everything by club. Use the organisation switcher in the top bar to create a new club or select an existing one to get started."
      />
    </div>
  );
}

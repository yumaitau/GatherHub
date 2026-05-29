import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import {
  Users,
  Shield,
  CalendarDays,
  Package,
  AlertTriangle,
  PackageX,
  HandHeart,
  Building2,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, LoadingState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { formatCurrency, formatDateTime, humanise } from "@/lib/utils";

export default function DashboardPage() {
  const { org } = useGatherHub();
  const stats = useQuery(api.dashboard.stats);
  const audit = useQuery(api.dashboard.recentAudit);

  if (stats === undefined) return <LoadingState />;

  const widgets = [
    {
      label: "Active members",
      value: stats.memberCount,
      icon: Users,
      to: "/members",
    },
    {
      label: "Active teams",
      value: stats.teamCount,
      icon: Shield,
      to: "/teams",
    },
    {
      label: "Upcoming events",
      value: stats.upcomingEventCount,
      icon: CalendarDays,
      to: "/events",
    },
    {
      label: "Assets tracked",
      value: stats.assetCount,
      icon: Package,
      to: "/assets",
    },
    {
      label: "Checked out",
      value: stats.checkedOutCount,
      icon: Clock,
      to: "/assets",
    },
    {
      label: "Overdue",
      value: stats.overdueCount,
      icon: AlertTriangle,
      to: "/assets",
      alert: stats.overdueCount > 0,
    },
    {
      label: "Lost assets",
      value: stats.lostCount,
      icon: PackageX,
      to: "/assets",
      alert: stats.lostCount > 0,
    },
    {
      label: "Volunteers",
      value: stats.volunteerCount,
      icon: HandHeart,
      to: "/volunteers",
    },
    {
      label: "Expiring certs",
      value: stats.expiringCertCount,
      icon: AlertTriangle,
      to: "/volunteers",
      alert: stats.expiringCertCount > 0,
    },
    {
      label: "Sponsors",
      value: stats.sponsorCount,
      icon: Building2,
      to: "/sponsors",
    },
  ];

  return (
    <div>
      <PageHeader
        title={`${org?.name ?? "Club"} dashboard`}
        description="Your club at a glance."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {widgets.map((w) => (
          <Link key={w.label} to={w.to}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <w.icon
                    className={
                      w.alert
                        ? "h-5 w-5 text-destructive"
                        : "h-5 w-5 text-muted-foreground"
                    }
                  />
                  <span
                    className={
                      w.alert && w.value > 0
                        ? "text-2xl font-bold text-destructive"
                        : "text-2xl font-bold"
                    }
                  >
                    {w.value}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{w.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {formatCurrency(stats.sponsorValue)}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Sponsor value</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent asset activity</CardTitle>
        </CardHeader>
        <CardContent>
          {audit === undefined ? (
            <LoadingState />
          ) : audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y">
              {audit.slice(0, 10).map((entry) => (
                <li
                  key={entry._id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{entry.assetName}</span>{" "}
                    <span className="text-muted-foreground">
                      — {humanise(entry.action)} by {entry.performerName}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatDateTime(entry.performedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

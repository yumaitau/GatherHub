import * as React from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import {
  ArrowRight,
  PackageX,
  ShieldAlert,
  Clock,
  Inbox,
} from "lucide-react";
import { PageHeader, LoadingState } from "@/components/shared";
import { AuditRow } from "@/components/ui/audit-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { useGatherHub } from "@/lib/gatherhub";
import {
  formatCurrency,
  formatDateTime,
  humanise,
} from "@/lib/utils";

interface AttentionItem {
  count: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "warning" | "danger" | "info";
  to: string;
}

export default function DashboardPage() {
  const { org } = useGatherHub();
  const stats = useQuery(api.dashboard.stats);
  const audit = useQuery(api.dashboard.recentAudit);

  if (stats === undefined) return <LoadingState />;

  const attention: AttentionItem[] = [
    {
      count: stats.overdueCount,
      label: stats.overdueCount === 1 ? "Overdue item" : "Overdue items",
      icon: Clock,
      tone: "warning",
      to: "/assets",
    },
    {
      count: stats.lostCount,
      label: stats.lostCount === 1 ? "Lost item" : "Lost items",
      icon: PackageX,
      tone: "danger",
      to: "/assets",
    },
    {
      count: stats.expiringCertCount,
      label:
        stats.expiringCertCount === 1
          ? "Certification expiring soon"
          : "Certifications expiring soon",
      icon: ShieldAlert,
      tone: "warning",
      to: "/volunteers",
    },
  ];

  const flagged = attention.filter((a) => a.count > 0);

  return (
    <div>
      <PageHeader
        title={org?.name ?? "Dashboard"}
        description="What needs your attention today."
      />

      <section
        aria-label="Items needing attention"
        className="mb-9 rounded-md border border-hairline bg-surface"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div className="flex items-baseline gap-3">
            <h2 className="text-title text-ink-strong">Needs attention</h2>
            <span className="text-caption text-ink-quiet">
              {flagged.length === 0
                ? "Everything in order."
                : `${flagged.reduce((s, a) => s + a.count, 0)} across ${flagged.length} ${flagged.length === 1 ? "category" : "categories"}`}
            </span>
          </div>
        </header>
        {flagged.length === 0 ? (
          <EmptyState
            title="Nothing flagged."
            description="Overdue items, losses, and expiring certifications will appear here."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {flagged.map((item) => (
              <li key={item.label}>
                <AttentionRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,1.4fr)] mb-9">
        <Panel title="Open invitations" tone="quiet">
          <PendingInvitesPanel />
        </Panel>

        <Panel
          title="Recent KitTrace activity"
          action={
            audit && audit.length > 0 ? (
              <Link
                to="/assets"
                className="text-caption text-ink-soft hover:text-ink inline-flex items-center gap-1"
              >
                Open KitTrace
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null
          }
        >
          {audit === undefined ? (
            <LoadingState />
          ) : audit.length === 0 ? (
            <EmptyState
              title="No KitTrace activity yet."
              description="Issuing, returning, and transferring items will show here as it happens."
            />
          ) : (
            <div role="list" aria-label="Recent KitTrace audit entries">
              {audit.slice(0, 8).map((entry) => (
                <AuditRow
                  key={entry._id}
                  timestamp={formatDateTime(entry.performedAt)}
                  actor={
                    <span className="font-semi text-ink">
                      {entry.performerName}
                    </span>
                  }
                  action={
                    <span>
                      <span className="text-ink-soft">{humanise(entry.action)}</span>{" "}
                      <Link
                        to={`/assets/${entry.assetId}`}
                        className="text-ink hover:text-primary font-semi"
                      >
                        {entry.assetName}
                      </Link>
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <GlanceStrip stats={stats} />
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const toneText =
    item.tone === "danger"
      ? "text-danger"
      : item.tone === "warning"
        ? "text-warning"
        : "text-info";
  return (
    <Link
      to={item.to}
      className="group/att flex items-center gap-3 px-5 py-3 hover:bg-surface-sunk/60 transition-colors duration-fast ease-out"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-surface-sunk text-ink-soft"
      >
        <item.icon className={`h-4 w-4 ${toneText}`} />
      </span>
      <span className="flex-1 min-w-0 text-body text-ink">
        <span className={`font-semi ${toneText}`} data-numeric>
          {item.count}
        </span>{" "}
        {item.label.toLowerCase()}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-ink-quiet group-hover/att:text-ink shrink-0" />
    </Link>
  );
}

function Panel({
  title,
  action,
  tone = "default",
  children,
}: {
  title: string;
  action?: React.ReactNode;
  tone?: "default" | "quiet";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-md border border-hairline ${tone === "quiet" ? "bg-surface-sunk/40" : "bg-surface"}`}
    >
      <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-hairline">
        <h2 className="text-title text-ink-strong">{title}</h2>
        {action}
      </header>
      <div>{children}</div>
    </section>
  );
}

function PendingInvitesPanel() {
  const invites = useQuery(api.invitations.list);
  if (invites === undefined) return <LoadingState />;
  const pending = invites.filter((i) => i.status === "pending");
  if (pending.length === 0) {
    return (
      <EmptyState
        title="No open invitations."
        description="Invite someone from Members to onboard them with a role."
        icon={<Inbox className="h-5 w-5" />}
      />
    );
  }
  return (
    <ul className="divide-y divide-hairline">
      {pending.slice(0, 5).map((i) => (
        <li
          key={i.id}
          className="flex items-center gap-2 px-5 py-2.5"
        >
          <span className="flex-1 min-w-0 text-body text-ink truncate">
            {i.email}
          </span>
          <span className="text-caption text-ink-quiet">{humanise(i.role)}</span>
        </li>
      ))}
    </ul>
  );
}

function GlanceStrip({
  stats,
}: {
  stats: NonNullable<ReturnType<typeof useDashboardStats>>;
}) {
  const cells = [
    { label: "Members", value: stats.memberCount, to: "/members" },
    { label: "Teams", value: stats.teamCount, to: "/teams" },
    { label: "Events upcoming", value: stats.upcomingEventCount, to: "/events" },
    { label: "Volunteers", value: stats.volunteerCount, to: "/volunteers" },
    { label: "Items tracked", value: stats.assetCount, to: "/assets" },
    {
      label: "Checked out",
      value: stats.checkedOutCount,
      to: "/assets",
    },
    { label: "Sponsors", value: stats.sponsorCount, to: "/sponsors" },
    {
      label: "Sponsor value",
      value: formatCurrency(stats.sponsorValue),
      to: "/sponsors",
    },
  ];
  return (
    <section aria-label="Workspace at a glance">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-label text-ink-quiet">At a glance</h2>
        <Separator className="flex-1" />
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-4">
        {cells.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="group/g block focus-visible:outline-none focus-visible:shadow-focus rounded-xs"
          >
            <dt className="text-caption text-ink-quiet">{c.label}</dt>
            <dd
              className="text-headline text-ink-strong font-strong group-hover/g:text-primary transition-colors duration-fast ease-out"
              data-numeric
            >
              {c.value}
            </dd>
          </Link>
        ))}
      </dl>
    </section>
  );
}

function useDashboardStats() {
  return useQuery(api.dashboard.stats);
}

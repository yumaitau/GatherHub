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
  CalendarDays,
  Package,
  LogIn,
  LogOut,
  ArrowRightLeft,
  AlertTriangle,
  Wrench,
  Archive,
  Pencil,
  Plus,
  Sparkles,
  ClipboardList,
  CreditCard,
  ShieldCheck,
  Gauge,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { LoadingState } from "@/components/shared";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { QuickCreateMenu } from "@/components/layout/quick-create-menu";
import { useGatherHub } from "@/lib/gatherhub";
import { formatCurrency, greeting, humanise, relativeTime } from "@/lib/utils";

interface AttentionItem {
  count: number;
  singular: string;
  plural: string;
  icon: LucideIcon;
  tone: "warning" | "danger" | "info";
  to: string;
}

export default function DashboardPage() {
  const { org, user } = useGatherHub();
  const stats = useQuery(api.dashboard.stats);
  const audit = useQuery(api.dashboard.recentAudit);
  const events = useQuery(api.events.list, { upcomingOnly: true });

  if (stats === undefined) return <LoadingState />;

  const firstName = user?.firstName?.trim();
  const greet = greeting();

  const attention: AttentionItem[] = [
    {
      count: stats.overdueCount,
      singular: "Overdue item",
      plural: "Overdue items",
      icon: Clock,
      tone: "warning",
      to: "/assets",
    },
    {
      count: stats.lostCount,
      singular: "Lost item",
      plural: "Lost items",
      icon: PackageX,
      tone: "danger",
      to: "/assets",
    },
    {
      count: stats.expiringCertCount,
      singular: "Cert expiring",
      plural: "Certs expiring",
      icon: ShieldAlert,
      tone: "warning",
      to: "/volunteers",
    },
  ];

  const flagged = attention.filter((a) => a.count > 0);

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-display text-ink-strong">
            {greet}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-body text-ink-soft mt-1.5">
            Here&apos;s what&apos;s happening at{" "}
            <span className="font-semi text-ink">
              {org?.name ?? "your organisation"}
            </span>
            .
          </p>
        </div>
        <QuickCreateMenu />
      </header>

      {flagged.length > 0 ? (
        <section
          aria-label="Items needing attention"
          className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {flagged.map((item) => (
            <AttentionCard key={item.singular} item={item} />
          ))}
        </section>
      ) : (
        <section
          aria-label="No items flagged"
          className="mb-8 flex items-center gap-3 rounded-md border border-hairline bg-success-wash/40 px-5 py-3.5"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-success-wash text-success"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-ink-strong">
              Everything in order.
            </p>
            <p className="text-caption text-ink-soft">
              Overdue items, losses, and expiring certifications will surface
              here as they appear.
            </p>
          </div>
        </section>
      )}

      <GlanceStrip stats={stats} />

      <div className="grid gap-6 mt-8 mb-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel
          title="Upcoming events"
          action={
            <Link
              to="/events"
              className="text-caption text-ink-soft hover:text-ink inline-flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <UpcomingEventsBody events={events} />
        </Panel>

        <Panel
          title="Recent activity"
          action={
            audit && audit.length > 0 ? (
              <Link
                to="/assets"
                className="text-caption text-ink-soft hover:text-ink inline-flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null
          }
        >
          <RecentActivityBody audit={audit} />
        </Panel>
      </div>

      <PendingInvitesBlock />

      {org?.soccerMode && <SoccerSummary />}
    </div>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const wash =
    item.tone === "danger"
      ? "bg-danger-wash/55"
      : item.tone === "warning"
        ? "bg-warning-wash/55"
        : "bg-info-wash/55";
  const ink =
    item.tone === "danger"
      ? "text-danger"
      : item.tone === "warning"
        ? "text-warning"
        : "text-info";
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`group/att block rounded-md border border-hairline ${wash} transition-colors duration-fast ease-out hover:border-border-strong focus-visible:outline-none focus-visible:shadow-focus`}
    >
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5 mb-1.5">
          <Icon className={`h-4 w-4 ${ink}`} aria-hidden="true" />
          <p className="text-caption text-ink-soft uppercase tracking-[0.04em] font-semi">
            {item.count === 1 ? item.singular : item.plural}
          </p>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span
            data-numeric
            className={`text-display font-strong tracking-[-0.02em] ${ink}`}
          >
            {item.count}
          </span>
          <span className="text-caption text-ink-soft inline-flex items-center gap-1 group-hover/att:text-ink">
            Review
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-hairline">
        <h2 className="text-title text-ink-strong">{title}</h2>
        {action}
      </header>
      <div>{children}</div>
    </section>
  );
}

type EventRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.events.list>>
>[number];

function UpcomingEventsBody({ events }: { events: EventRow[] | undefined }) {
  if (events === undefined) return <LoadingState />;
  if (events.length === 0) {
    return (
      <EmptyState
        title="No upcoming events."
        description="Trainings, matches, and meetings will appear here once scheduled."
        icon={<CalendarDays className="h-5 w-5" />}
      />
    );
  }
  const next = events.slice(0, 5);
  return (
    <ul className="divide-y divide-hairline">
      {next.map((e) => (
        <li key={e._id}>
          <Link
            to={`/events/${e._id}`}
            className="group/ev flex items-center gap-4 px-5 py-3 hover:bg-surface-sunk/60 transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:shadow-focus"
          >
            <DateTile ms={e.startTime} />
            <div className="min-w-0 flex-1">
              <p className="text-body-strong text-ink-strong truncate group-hover/ev:text-primary">
                {e.title}
              </p>
              <p className="text-caption text-ink-quiet truncate">
                <time dateTime={new Date(e.startTime).toISOString()}>
                  {formatEventTime(e.startTime)}
                </time>
                {e.teamName ? ` · ${e.teamName}` : ""}
                {e.opponent ? ` · vs ${e.opponent}` : ""}
              </p>
            </div>
            <span className="text-caption text-ink-quiet capitalize shrink-0">
              {humanise(e.type)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DateTile({ ms }: { ms: number }) {
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { day: "numeric" });
  const month = d
    .toLocaleDateString(undefined, { month: "short" })
    .toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-sm border border-hairline bg-paper"
    >
      <span
        className="text-headline leading-none font-strong text-ink-strong"
        data-numeric
      >
        {day}
      </span>
      <span className="text-label text-ink-quiet mt-0.5">{month}</span>
    </div>
  );
}

function formatEventTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type AuditEntry = NonNullable<
  ReturnType<typeof useQuery<typeof api.dashboard.recentAudit>>
>[number];

function RecentActivityBody({ audit }: { audit: AuditEntry[] | undefined }) {
  if (audit === undefined) return <LoadingState />;
  if (audit.length === 0) {
    return (
      <EmptyState
        title="No activity yet."
        description="Issuing, returning, and transferring items will show here as it happens."
        icon={<Package className="h-5 w-5" />}
      />
    );
  }
  return (
    <ul className="divide-y divide-hairline">
      {audit.slice(0, 8).map((entry) => (
        <li key={entry._id}>
          <ActivityRow entry={entry} />
        </li>
      ))}
    </ul>
  );
}

interface ActionVisual {
  icon: LucideIcon;
  wash: string;
  ink: string;
}

const ACTION_VISUAL: Record<string, ActionVisual> = {
  created: { icon: Plus, wash: "bg-accent-wash", ink: "text-accent" },
  updated: { icon: Pencil, wash: "bg-info-wash", ink: "text-info" },
  checked_out: { icon: LogOut, wash: "bg-warning-wash", ink: "text-warning" },
  checked_in: { icon: LogIn, wash: "bg-success-wash", ink: "text-success" },
  transferred: {
    icon: ArrowRightLeft,
    wash: "bg-info-wash",
    ink: "text-info",
  },
  reported_lost: {
    icon: AlertTriangle,
    wash: "bg-danger-wash",
    ink: "text-danger",
  },
  maintenance: { icon: Wrench, wash: "bg-warning-wash", ink: "text-warning" },
  retired: { icon: Archive, wash: "bg-surface-sunk", ink: "text-ink-quiet" },
  tag_registered: {
    icon: Package,
    wash: "bg-accent-wash",
    ink: "text-accent",
  },
  tag_reassigned: {
    icon: ArrowRightLeft,
    wash: "bg-accent-wash",
    ink: "text-accent",
  },
};

function ActivityRow({ entry }: { entry: AuditEntry }) {
  const visual = ACTION_VISUAL[entry.action] ?? {
    icon: Package,
    wash: "bg-surface-sunk",
    ink: "text-ink-quiet",
  };
  const Icon = visual.icon;
  return (
    <Link
      to={`/assets/${entry.assetId}`}
      className="group/act flex items-start gap-3 px-5 py-3 hover:bg-surface-sunk/60 transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:shadow-focus"
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm ${visual.wash} ${visual.ink}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink">
          <span className="font-semi text-ink-strong">
            {humanise(entry.action)}
          </span>{" "}
          <span className="text-ink-soft">{entry.assetName}</span>
        </p>
        <p className="text-caption text-ink-quiet">by {entry.performerName}</p>
      </div>
      <span className="text-caption text-ink-quiet shrink-0 whitespace-nowrap">
        {relativeTime(entry.performedAt)}
      </span>
    </Link>
  );
}

function PendingInvitesBlock() {
  const invites = useQuery(api.invitations.list);
  if (invites === undefined) return null;
  const pending = invites.filter((i) => i.status === "pending");
  if (pending.length === 0) return null;
  return (
    <section className="mb-8 rounded-md border border-hairline bg-surface overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-hairline">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-ink-quiet" aria-hidden="true" />
          <h2 className="text-title text-ink-strong">Open invitations</h2>
        </div>
        <span className="text-caption text-ink-quiet">
          <span data-numeric className="font-medium text-ink-soft">
            {pending.length}
          </span>{" "}
          pending
        </span>
      </header>
      <ul className="divide-y divide-hairline">
        {pending.slice(0, 5).map((i) => (
          <li key={i.id} className="flex items-center gap-2 px-5 py-2.5">
            <span className="flex-1 min-w-0 text-body text-ink truncate">
              {i.email}
            </span>
            <span className="text-caption text-ink-quiet">
              {humanise(i.role)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SoccerSummary() {
  const stats = useQuery(api.soccer.dashboardStats);
  if (stats === undefined) return null;
  if (stats === null) return null;

  const registrationRate =
    stats.playerCount > 0
      ? Math.round((stats.registered / stats.playerCount) * 100)
      : 0;
  const paymentRate =
    stats.playerCount > 0
      ? Math.round((stats.paid / stats.playerCount) * 100)
      : 0;
  const gradingRate =
    stats.playerCount > 0
      ? Math.round((stats.evaluatedFully / stats.playerCount) * 100)
      : 0;

  return (
    <section aria-label="Soccer club summary" className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-label text-ink-quiet">Soccer club</h2>
        <Separator className="flex-1" />
        <Link
          to="/soccer/registrations"
          className="text-caption text-ink-soft hover:text-ink inline-flex items-center gap-1"
        >
          View registrations
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SoccerCard
          icon={ClipboardList}
          tone="info"
          label="Registered"
          value={`${stats.registered} / ${stats.playerCount}`}
          subline={`${registrationRate}% of active members`}
          to="/soccer/registrations"
          progress={registrationRate}
        />
        <SoccerCard
          icon={CreditCard}
          tone={stats.unpaid > 0 ? "warning" : "success"}
          label="Paid in full"
          value={`${stats.paid} / ${stats.playerCount}`}
          subline={
            stats.onPaymentPlan > 0
              ? `${stats.onPaymentPlan} on payment plan${
                  stats.expiredPaymentPlans > 0
                    ? ` (${stats.expiredPaymentPlans} expired)`
                    : ""
                }`
              : `${paymentRate}% of active members`
          }
          to="/soccer/registrations"
          progress={paymentRate}
        />
        <SoccerCard
          icon={ShieldCheck}
          tone={stats.outstandingWwvp > 0 ? "danger" : "success"}
          label="WWVP outstanding"
          value={String(stats.outstandingWwvp)}
          subline={`${stats.wwvpApproved} approved · ${stats.wwvpSighted} sighted · ${stats.wwvpPending} pending`}
          to="/soccer/coaches-managers"
        />
        <SoccerCard
          icon={UserCog}
          tone="info"
          label="Coaches & managers"
          value={`${stats.coachCount + stats.managerCount}`}
          subline={`${stats.coachCount} coach${stats.coachCount === 1 ? "" : "es"} · ${stats.managerCount} manager${stats.managerCount === 1 ? "" : "s"}`}
          to="/soccer/coaches-managers"
        />
        <SoccerCard
          icon={Gauge}
          tone="info"
          label="Players graded"
          value={`${stats.evaluatedFully} / ${stats.playerCount}`}
          subline={
            stats.activeSkillCount > 0
              ? `${stats.evaluatedAny} started, fully scored against ${stats.activeSkillCount} skill${stats.activeSkillCount === 1 ? "" : "s"}`
              : "No active skills in rubric"
          }
          to="/soccer/grading"
          progress={gradingRate}
        />
      </div>
    </section>
  );
}

function SoccerCard({
  icon: Icon,
  tone,
  label,
  value,
  subline,
  to,
  progress,
}: {
  icon: LucideIcon;
  tone: "info" | "warning" | "danger" | "success";
  label: string;
  value: string;
  subline: string;
  to: string;
  progress?: number;
}) {
  const ink =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-primary";
  const barColor =
    tone === "danger"
      ? "bg-danger"
      : tone === "warning"
        ? "bg-warning"
        : tone === "success"
          ? "bg-success"
          : "bg-primary";
  return (
    <Link
      to={to}
      className="group/sc block rounded-md border border-hairline bg-surface transition-colors duration-fast ease-out hover:border-border-strong focus-visible:outline-none focus-visible:shadow-focus"
    >
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className={`h-4 w-4 ${ink}`} aria-hidden="true" />
          <p className="text-caption text-ink-soft uppercase tracking-[0.04em] font-semi">
            {label}
          </p>
        </div>
        <p
          data-numeric
          className={`text-display font-strong tracking-[-0.02em] ${ink}`}
        >
          {value}
        </p>
        <p className="text-caption text-ink-quiet mt-1">{subline}</p>
        {progress !== undefined && (
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded-xs bg-surface-sunk"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full ${barColor}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    </Link>
  );
}

function GlanceStrip({
  stats,
}: {
  stats: NonNullable<ReturnType<typeof useQuery<typeof api.dashboard.stats>>>;
}) {
  const cells = [
    { label: "Members", value: stats.memberCount, to: "/members" },
    { label: "Teams", value: stats.teamCount, to: "/teams" },
    {
      label: "Events upcoming",
      value: stats.upcomingEventCount,
      to: "/events",
    },
    { label: "Volunteers", value: stats.volunteerCount, to: "/volunteers" },
    { label: "Items tracked", value: stats.assetCount, to: "/assets" },
    { label: "Checked out", value: stats.checkedOutCount, to: "/assets" },
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

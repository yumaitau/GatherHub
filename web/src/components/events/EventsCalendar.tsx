import * as React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, {
  type DateClickArg,
} from "@fullcalendar/interaction";
import type {
  DatesSetArg,
  EventClickArg,
  EventInput,
  EventContentArg,
} from "@fullcalendar/core";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import type { EventDropArg } from "@fullcalendar/core";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Shared calendar surface for events. Lifted from RangerOS but stripped
 * of task-create behaviour: clicks navigate to the existing event
 * detail page; dragging and inline edit are disabled. Creation flows
 * through the NewEventDialog in EventsPage.
 */
export type CalendarEventInput = {
  id: string;
  title: string;
  start: number;
  end?: number;
  type?: string;
  teamName?: string | null;
  location?: string | null;
};

type CalendarViewName =
  | "dayGridMonth"
  | "timeGridWeek"
  | "timeGridDay"
  | "listWeek";

const VIEW_LABELS: Record<CalendarViewName, string> = {
  dayGridMonth: "Month",
  timeGridWeek: "Week",
  timeGridDay: "Day",
  listWeek: "List",
};

const TYPE_TINT: Record<string, { bg: string; border: string }> = {
  match: {
    bg: "oklch(var(--accent-base) / 0.16)",
    border: "oklch(var(--accent-base))",
  },
  training: {
    bg: "oklch(var(--info) / 0.16)",
    border: "oklch(var(--info))",
  },
  meeting: {
    bg: "oklch(var(--warning) / 0.16)",
    border: "oklch(var(--warning))",
  },
  social: {
    bg: "oklch(var(--success) / 0.16)",
    border: "oklch(var(--success))",
  },
  working_bee: {
    bg: "oklch(var(--info) / 0.16)",
    border: "oklch(var(--info))",
  },
};

function tintForType(t?: string) {
  return (
    TYPE_TINT[t ?? ""] ?? {
      bg: "oklch(var(--surface-sunk))",
      border: "oklch(var(--border-default))",
    }
  );
}

function EventChip(arg: EventContentArg) {
  const subtitle = [
    arg.event.extendedProps.teamName,
    arg.event.extendedProps.location,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="min-w-0 px-2 py-1 leading-snug">
      {arg.timeText && (
        <div className="truncate text-[12px] font-semi opacity-90" data-numeric>
          {arg.timeText}
        </div>
      )}
      <div className="truncate text-[14px] font-semi">{arg.event.title}</div>
      {subtitle && (
        <div className="truncate text-[12px] opacity-85">{subtitle}</div>
      )}
    </div>
  );
}

export function EventsCalendar({
  events,
  onDateClick,
  initialView = "dayGridMonth",
  canEdit = false,
}: {
  events: CalendarEventInput[];
  onDateClick?: (date: Date) => void;
  initialView?: CalendarViewName;
  canEdit?: boolean;
}) {
  const ref = React.useRef<FullCalendar | null>(null);
  const navigate = useNavigate();
  const updateEvent = useMutation(api.events.update);
  const [title, setTitle] = React.useState("");
  const [activeView, setActiveView] =
    React.useState<CalendarViewName>(initialView);

  React.useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    if (q.matches) {
      window.setTimeout(() => {
        ref.current?.getApi().changeView("listWeek");
        setActiveView("listWeek");
      }, 0);
    }
  }, []);

  const fcEvents: EventInput[] = React.useMemo(
    () =>
      events.map((e) => {
        const tint = tintForType(e.type);
        return {
          id: e.id,
          title: e.title,
          start: new Date(e.start).toISOString(),
          end: e.end ? new Date(e.end).toISOString() : undefined,
          backgroundColor: tint.bg,
          borderColor: tint.border,
          extendedProps: {
            teamName: e.teamName ?? null,
            location: e.location ?? null,
            type: e.type ?? null,
          },
        };
      }),
    [events],
  );

  function changeView(v: CalendarViewName) {
    ref.current?.getApi().changeView(v);
    setActiveView(v);
  }

  function onDatesSet(arg: DatesSetArg) {
    setTitle(arg.view.title);
    setActiveView(arg.view.type as CalendarViewName);
  }

  function onEventClick(arg: EventClickArg) {
    navigate(`/events/${arg.event.id}`);
  }

  function onCalendarDateClick(arg: DateClickArg) {
    onDateClick?.(arg.date);
  }

  async function onEventDrop(arg: EventDropArg) {
    if (!canEdit || !arg.event.start) {
      arg.revert();
      return;
    }
    const newStart = arg.event.start.getTime();
    const newEnd = arg.event.end ? arg.event.end.getTime() : undefined;
    const when = new Date(newStart).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    try {
      await updateEvent({
        eventId: arg.event.id as Id<"events">,
        startTime: newStart,
        endTime: newEnd,
      });
      toastSuccess(`Rescheduled "${arg.event.title}" to ${when}`);
    } catch (err) {
      arg.revert();
      toastFailure(err, "Could not reschedule event.");
    }
  }

  return (
    <section className="rounded-md border border-hairline bg-surface overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-hairline bg-surface-sunk/30 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => ref.current?.getApi().today()}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => ref.current?.getApi().prev()}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => ref.current?.getApi().next()}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="ml-1 inline-flex items-center gap-2 text-body-strong text-ink-strong">
            <CalendarDays
              className="h-4 w-4 text-ink-quiet"
              aria-hidden="true"
            />
            {title}
          </div>
        </div>
        <div
          className="inline-flex rounded-sm border border-hairline overflow-hidden"
          role="group"
          aria-label="Calendar range"
        >
          {(Object.keys(VIEW_LABELS) as CalendarViewName[]).map((v, idx) => (
            <button
              key={v}
              type="button"
              onClick={() => changeView(v)}
              aria-pressed={activeView === v}
              className={cn(
                "inline-flex items-center px-3 h-8 text-body",
                "transition-colors duration-fast ease-out",
                "focus-visible:outline-none focus-visible:shadow-focus",
                idx > 0 && "border-l border-hairline",
                activeView === v
                  ? "bg-paper text-ink-strong font-semi"
                  : "bg-surface-sunk text-ink hover:text-ink-strong",
              )}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("gh-calendar p-2 sm:p-4")}>
        <FullCalendar
          ref={ref}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
          ]}
          initialView={initialView}
          headerToolbar={false}
          height="auto"
          expandRows
          nowIndicator
          dayMaxEvents={3}
          events={fcEvents}
          eventContent={EventChip}
          eventClick={onEventClick}
          dateClick={onCalendarDateClick}
          datesSet={onDatesSet}
          editable={canEdit}
          eventStartEditable={canEdit}
          eventDurationEditable={false}
          eventDrop={onEventDrop}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          timeZone="local"
          locale="en-au"
          firstDay={1}
        />
      </div>
    </section>
  );
}

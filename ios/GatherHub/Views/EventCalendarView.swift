import SwiftUI
import UIKit

/// Calendar surface that replaces the flat event list. Wraps Apple's
/// `UICalendarView` (iOS 16+) so the month grid, gestures, paging,
/// localisation and dynamic type all come for free. Days that have at
/// least one event render a small accent dot; tapping a day reveals
/// the events for that date below the calendar.
struct EventCalendarView: View {
    let context: CurrentContext

    @EnvironmentObject private var convex: ConvexService
    @StateObject private var model = EventListViewModel()

    @State private var selected: DateComponents = {
        var c = Calendar.current.dateComponents([.year, .month, .day], from: .now)
        return c
    }()

    @State private var presentedEvent: Event?

    var body: some View {
        NavigationStack {
            Group {
                switch model.phase {
                case .loading:
                    ProgressView("Loading events…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.gh.paper.ignoresSafeArea())
                case .failed(let message):
                    OfflineStateView(
                        title: "Couldn't load events",
                        message: message,
                        retry: { await model.load(context: context, convex: convex) }
                    )
                case .loaded:
                    content
                }
            }
            .navigationTitle("Events")
            .overlay(alignment: .top) { ErrorBanner(message: $model.actionError) }
            .task { await model.load(context: context, convex: convex) }
            .refreshable { await model.load(context: context, convex: convex) }
            .sheet(item: $presentedEvent) { event in
                EventDetailSheet(
                    event: event,
                    selection: model.selection[event.id],
                    busy: model.busyEventId == event.id,
                    canRsvp: model.canRsvp
                ) { status in
                    Task {
                        await model.setRsvp(
                            event: event,
                            status: status,
                            convex: convex
                        )
                    }
                }
            }
        }
    }

    private var content: some View {
        let byDay = eventsByDay(model.events)

        return VStack(spacing: 0) {
            CalendarMonthView(
                eventDays: Set(byDay.keys),
                selection: $selected
            )
            .background(Color.gh.surface)
            .overlay(
                Rectangle()
                    .fill(Color.gh.hairline)
                    .frame(height: 1),
                alignment: .bottom
            )

            dayList(events: byDay[selectedDayKey(selected)] ?? [])
        }
        .background(Color.gh.paper.ignoresSafeArea())
    }

    private func dayList(events: [Event]) -> some View {
        Group {
            if events.isEmpty {
                EmptyStateView(
                    title: "No events on this day",
                    systemImage: "calendar",
                    message: "Tap a highlighted day to view what's on."
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(events) { event in
                    Button {
                        presentedEvent = event
                    } label: {
                        EventRow(
                            event: event,
                            selection: model.selection[event.id],
                            busy: model.busyEventId == event.id,
                            canRsvp: model.canRsvp
                        ) { status in
                            Task {
                                await model.setRsvp(
                                    event: event,
                                    status: status,
                                    convex: convex
                                )
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.gh.surface)
                }
                .listStyle(.plain)
            }
        }
    }

    private func eventsByDay(_ events: [Event]) -> [String: [Event]] {
        var out: [String: [Event]] = [:]
        let cal = Calendar.current
        for event in events {
            let comps = cal.dateComponents([.year, .month, .day], from: event.startDate)
            let key = "\(comps.year ?? 0)-\(comps.month ?? 0)-\(comps.day ?? 0)"
            out[key, default: []].append(event)
        }
        // Sort each day's events chronologically.
        for k in out.keys { out[k]?.sort { $0.startTime < $1.startTime } }
        return out
    }

    private func selectedDayKey(_ comps: DateComponents) -> String {
        "\(comps.year ?? 0)-\(comps.month ?? 0)-\(comps.day ?? 0)"
    }
}

// MARK: - UICalendarView bridge

private struct CalendarMonthView: UIViewRepresentable {
    let eventDays: Set<String>
    @Binding var selection: DateComponents

    func makeCoordinator() -> Coordinator {
        Coordinator(eventDays: eventDays, selection: $selection)
    }

    func makeUIView(context: Context) -> UICalendarView {
        let view = UICalendarView()
        view.calendar = Calendar.current
        view.tintColor = UIColor(Color.gh.accent)
        view.delegate = context.coordinator
        let single = UICalendarSelectionSingleDate(delegate: context.coordinator)
        single.setSelected(selection, animated: false)
        view.selectionBehavior = single
        return view
    }

    func updateUIView(_ uiView: UICalendarView, context: Context) {
        context.coordinator.eventDays = eventDays
        // Reload decorations for any day that may have changed event state.
        let cal = Calendar.current
        let visible = uiView.visibleDateComponents
        if let monthStart = cal.date(from: DateComponents(year: visible.year, month: visible.month, day: 1)),
           let range = cal.range(of: .day, in: .month, for: monthStart) {
            let comps = range.compactMap { day -> DateComponents? in
                DateComponents(year: visible.year, month: visible.month, day: day)
            }
            uiView.reloadDecorations(forDateComponents: comps, animated: false)
        }
    }

    final class Coordinator: NSObject, UICalendarViewDelegate, UICalendarSelectionSingleDateDelegate {
        var eventDays: Set<String>
        var selection: Binding<DateComponents>

        init(eventDays: Set<String>, selection: Binding<DateComponents>) {
            self.eventDays = eventDays
            self.selection = selection
        }

        func calendarView(_ calendarView: UICalendarView,
                          decorationFor dateComponents: DateComponents) -> UICalendarView.Decoration? {
            let key = "\(dateComponents.year ?? 0)-\(dateComponents.month ?? 0)-\(dateComponents.day ?? 0)"
            guard eventDays.contains(key) else { return nil }
            return .default(color: UIColor(Color.gh.accent), size: .small)
        }

        func dateSelection(_ selection: UICalendarSelectionSingleDate,
                           didSelectDate dateComponents: DateComponents?) {
            guard let dateComponents else { return }
            self.selection.wrappedValue = dateComponents
        }
    }
}

// MARK: - Day list row

private struct EventRow: View {
    let event: Event
    let selection: RsvpStatus?
    let busy: Bool
    let canRsvp: Bool
    let onRsvp: (RsvpStatus) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            HStack(spacing: GHSpacing.sm) {
                Label(event.type.displayName, systemImage: event.type.systemImage)
                    .font(.gh.caption.weight(.semibold))
                    .foregroundStyle(Color.gh.inkQuiet)
                Spacer()
                if let going = event.goingCount {
                    Text("\(going) going")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            Text(event.title)
                .font(.gh.bodyStrong)
                .foregroundStyle(Color.gh.inkStrong)
            if let opponent = event.opponent, !opponent.isEmpty {
                Text("vs \(opponent)")
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkSoft)
            }
            HStack(spacing: GHSpacing.lg) {
                Label(
                    event.startDate.formatted(date: .omitted, time: .shortened),
                    systemImage: "clock"
                )
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkSoft)
                if let location = event.location, !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkSoft)
                }
                if let teamName = event.teamName {
                    Text(teamName)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            if canRsvp {
                rsvpControl
            }
        }
        .padding(.vertical, GHSpacing.xs)
    }

    private var rsvpControl: some View {
        HStack(spacing: GHSpacing.sm) {
            ForEach(RsvpStatus.allCases, id: \.self) { status in
                Button {
                    onRsvp(status)
                } label: {
                    Text(status.displayName)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.gh(selection == status ? .primary : .outline, size: .sm))
                .disabled(busy)
            }
        }
        .padding(.top, GHSpacing.xs)
    }
}

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
    @EnvironmentObject private var sync: SyncEnvironment
    @StateObject private var model = EventListViewModel()

    @State private var selected: DateComponents = {
        var c = Calendar.current.dateComponents([.year, .month, .day], from: .now)
        return c
    }()

    @State private var presentedEvent: Event?
    @State private var creatingEvent = false
    @State private var editingEvent: Event?
    @State private var deletingEvent: Event?

    private var canEditEvents: Bool { context.role.canManageEvents }

    var body: some View {
        NavigationStack {
            mainContent
            .navigationTitle("Events")
            .toolbar { eventToolbar }
            .overlay(alignment: .top) { ErrorBanner(message: $model.actionError) }
            .task { await reloadEvents() }
            .refreshable { await reloadEvents() }
            .sheet(item: $presentedEvent) { event in
                eventDetailSheet(for: event)
            }
            .sheet(isPresented: $creatingEvent) {
                eventEditorSheet(event: nil)
            }
            .sheet(item: $editingEvent) { event in
                eventEditorSheet(event: event)
            }
            .confirmationDialog(
                "Delete this event?",
                isPresented: Binding(
                    get: { deletingEvent != nil },
                    set: { if !$0 { deletingEvent = nil } }
                ),
                titleVisibility: .visible
            ) {
                if let event = deletingEvent {
                    Button("Delete", role: .destructive) {
                        Task { await delete(event) }
                    }
                }
            } message: {
                if let event = deletingEvent {
                    Text(event.title)
                }
            }
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        switch model.phase {
        case .loading:
            ProgressView("Loading events...")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.gh.paper.ignoresSafeArea())
        case .failed(let message):
            OfflineStateView(
                title: "Couldn't load events",
                message: message,
                retry: reloadEvents
            )
        case .loaded:
            content
        }
    }

    @ToolbarContentBuilder
    private var eventToolbar: some ToolbarContent {
        if canEditEvents {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    creatingEvent = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add event")
            }
        }
    }

    private func reloadEvents() async {
        await model.load(context: context, convex: convex, sync: sync)
    }

    private func handleSaved(_ event: Event, shouldReload: Bool) {
        model.upsertLocal(event, sync: sync)
        if shouldReload {
            Task { await reloadEvents() }
        }
    }

    private func eventDetailSheet(for event: Event) -> some View {
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
                    sync: sync
                )
            }
        }
    }

    private func eventEditorSheet(event: Event?) -> some View {
        EventEditorSheet(event: event) { event, shouldReload in
            handleSaved(event, shouldReload: shouldReload)
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
                                    sync: sync
                                )
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if canEditEvents && !event.id.hasPrefix("local:") {
                            Button {
                                editingEvent = event
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(Color.gh.accent)

                            Button(role: .destructive) {
                                deletingEvent = event
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
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

    private func delete(_ event: Event) async {
        do {
            try sync.enqueue(
                kind: .eventDelete,
                title: "Delete \(event.title)",
                payload: EventDeletePayload(eventId: event.id)
            )
            model.removeLocal(event.id, sync: sync)
            await sync.coordinator?.syncIfOnline()
        } catch {
            model.actionError = UserFacingError.message(error, fallback: "Couldn't queue event deletion.")
        }
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

private struct EventEditorSheet: View {
    let event: Event?
    let onSaved: (_ event: Event, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var eventTypes: [TaxonomyOption] = []
    @State private var teams: [Team] = []
    @State private var type: String
    @State private var title: String
    @State private var description: String
    @State private var location: String
    @State private var start: Date
    @State private var hasEnd: Bool
    @State private var end: Date
    @State private var teamId: String
    @State private var opponent: String
    @State private var saving = false
    @State private var error: String?

    init(
        event: Event?,
        onSaved: @escaping (_ event: Event, _ shouldReload: Bool) -> Void
    ) {
        self.event = event
        self.onSaved = onSaved
        let startDate = event?.startDate ?? .now
        self._type = State(initialValue: event?.type.rawValue ?? "training")
        self._title = State(initialValue: event?.title ?? "")
        self._description = State(initialValue: event?.description ?? "")
        self._location = State(initialValue: event?.location ?? "")
        self._start = State(initialValue: startDate)
        self._hasEnd = State(initialValue: event?.endTime != nil)
        self._end = State(initialValue: event?.endDate ?? startDate.addingTimeInterval(3600))
        self._teamId = State(initialValue: event?.teamId ?? "")
        self._opponent = State(initialValue: event?.opponent ?? "")
    }

    private var typeOptions: [(key: String, label: String)] {
        if eventTypes.isEmpty {
            return EventType.editableDefaults.map { ($0.rawValue, $0.displayName) }
        }
        return eventTypes.map { ($0.key, $0.label) }
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section {
                        Text(error)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.danger)
                    }
                }
                Section("Event") {
                    TextField("Title", text: $title)
                    Picker("Type", selection: $type) {
                        ForEach(typeOptions, id: \.key) { option in
                            Text(option.label).tag(option.key)
                        }
                    }
                    TextField("Opponent", text: $opponent)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                }
                Section("When") {
                    DatePicker("Start", selection: $start)
                    Toggle("End time", isOn: $hasEnd)
                    if hasEnd {
                        DatePicker("End", selection: $end)
                    }
                }
                Section("Where") {
                    TextField("Location", text: $location)
                    Picker("Team", selection: $teamId) {
                        Text("No team").tag("")
                        ForEach(teams.filter { $0.isActive }) { team in
                            Text(team.name).tag(team.id)
                        }
                    }
                }
            }
            .navigationTitle(event == nil ? "New event" : "Edit event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving)
                }
            }
            .task { await loadOptions() }
        }
    }

    private func loadOptions() async {
        if (try? sync.store?.hasCachedTeams()) == true {
            teams = (try? sync.store?.cachedTeams()) ?? []
        }
        if (try? sync.store?.hasCachedEventTypes()) == true {
            eventTypes = (try? sync.store?.cachedEventTypes()) ?? []
        }
        do {
            async let teamsTask = convex.listTeams(includeInactive: true)
            async let typesTask = convex.listEventTypes()
            let (teamRows, typeRows) = try await (teamsTask, typesTask)
            teams = teamRows
            eventTypes = typeRows
            try? sync.store?.replaceTeams(teamRows)
            try? sync.store?.replaceEventTypes(typeRows)
        } catch {
            // Cached/default options keep the form usable offline.
        }
    }

    private func save() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            error = "Title is required."
            return
        }
        guard !hasEnd || end >= start else {
            error = "End time must be after the start time."
            return
        }
        saving = true
        defer { saving = false }
        error = nil

        let payload = EventMutationPayload(
            type: type,
            title: trimmedTitle,
            description: cleaned(description),
            location: cleaned(location),
            startTime: start.timeIntervalSince1970 * 1000,
            endTime: hasEnd ? end.timeIntervalSince1970 * 1000 : nil,
            teamId: cleaned(teamId),
            opponent: cleaned(opponent)
        )

        do {
            let op: PendingSyncOperation
            let saved: Event
            if let event {
                op = try sync.enqueue(
                    kind: .eventUpdate,
                    title: "Update \(trimmedTitle)",
                    payload: EventUpdatePayload(eventId: event.id, event: payload)
                )
                saved = makeEvent(id: event.id, payload: payload, goingCount: event.goingCount)
            } else {
                op = try sync.enqueue(
                    kind: .eventCreate,
                    title: "Create \(trimmedTitle)",
                    payload: payload
                )
                saved = makeEvent(id: "local:\(op.clientId)", payload: payload, goingCount: 0)
            }
            updateCached(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue event change.")
        }
    }

    private func makeEvent(id: String, payload: EventMutationPayload, goingCount: Int?) -> Event {
        let selectedTeam = teams.first { $0.id == payload.teamId }
        return Event(
            id: id,
            type: EventType(rawValue: payload.type),
            title: payload.title,
            description: payload.description,
            location: payload.location,
            startTime: payload.startTime,
            endTime: payload.endTime,
            teamId: payload.teamId,
            opponent: payload.opponent,
            teamName: selectedTeam?.name,
            goingCount: goingCount
        )
    }

    private func updateCached(_ event: Event) {
        var rows = (try? sync.store?.cachedEvents()) ?? []
        if let index = rows.firstIndex(where: { $0.id == event.id }) {
            rows[index] = event
        } else {
            rows.append(event)
        }
        rows.sort { $0.startTime < $1.startTime }
        try? sync.store?.replaceEvents(rows)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
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

import SwiftUI

/// Upcoming events (`events:list`) with a quick RSVP control.
///
/// RSVP is recorded for a *member* (`events:setRsvp`). In this field-ops app we
/// RSVP on behalf of the signed-in user's own member record. The backend keys
/// `members` by `userId`, but `currentContext` returns the *user* id, not the
/// member id — so we resolve the caller's member via `members:list` once and
/// cache it. (If the backend later exposes the member id directly on context,
/// prefer that.)
struct EventListView: View {
    let context: CurrentContext

    @EnvironmentObject private var convex: ConvexService
    @StateObject private var model = EventListViewModel()

    var body: some View {
        NavigationStack {
            Group {
                switch model.phase {
                case .loading:
                    ProgressView("Loading events…")
                case .failed(let message):
                    OfflineStateView(
                        title: "Couldn't load events",
                        message: message,
                        retry: { await model.load(context: context, convex: convex) }
                    )
                case .loaded where model.events.isEmpty:
                    EmptyStateView(
                        title: "No upcoming events",
                        systemImage: "calendar",
                        message: "New training sessions, matches and meetings will appear here."
                    )
                case .loaded:
                    list
                }
            }
            .navigationTitle("Events")
            .overlay(alignment: .top) { ErrorBanner(message: $model.actionError) }
            .task { await model.load(context: context, convex: convex) }
            .refreshable { await model.load(context: context, convex: convex) }
        }
    }

    private var list: some View {
        List(model.events) { event in
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label(event.type.displayName, systemImage: event.type.systemImage)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    if let going = event.goingCount {
                        Text("\(going) going").font(.caption).foregroundStyle(.secondary)
                    }
                }

                Text(event.title).font(.headline)

                if let opponent = event.opponent, !opponent.isEmpty {
                    Text("vs \(opponent)").font(.subheadline).foregroundStyle(.secondary)
                }

                Label {
                    Text(event.startDate.formatted(date: .abbreviated, time: .shortened))
                } icon: {
                    Image(systemName: "clock")
                }
                .font(.subheadline)

                if let location = event.location, !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if let teamName = event.teamName {
                    Text(teamName).font(.caption).foregroundStyle(.secondary)
                }

                rsvpControl(for: event)
                    .padding(.top, 4)
            }
            .padding(.vertical, 4)
        }
        .listStyle(.plain)
    }

    private func rsvpControl(for event: Event) -> some View {
        HStack(spacing: 8) {
            ForEach(RsvpStatus.allCases, id: \.self) { status in
                Button {
                    Task { await model.setRsvp(event: event, status: status, convex: convex) }
                } label: {
                    Text(status.displayName)
                        .font(.caption.weight(.medium))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(model.selection[event.id] == status ? tint(for: status) : .secondary)
                .disabled(model.busyEventId == event.id || !model.canRsvp)
            }
        }
    }

    private func tint(for status: RsvpStatus) -> Color {
        switch status {
        case .going: return .green
        case .maybe: return .orange
        case .notGoing: return .red
        }
    }
}

/// View model for the event list: loads events, resolves the caller's member
/// id, and records RSVPs.
@MainActor
final class EventListViewModel: ObservableObject {
    enum Phase: Equatable { case loading, loaded, failed(String) }

    @Published var phase: Phase = .loading
    @Published var events: [Event] = []
    /// Locally tracked RSVP selection per event (the list endpoint returns only
    /// aggregate counts, not the caller's own status).
    @Published var selection: [String: RsvpStatus] = [:]
    @Published var busyEventId: String?
    @Published var actionError: String?

    /// The signed-in user's own member id, resolved from `members:list`.
    private var myMemberId: String?

    /// Whether RSVP is possible (we found the caller's member record).
    var canRsvp: Bool { myMemberId != nil }

    func load(context: CurrentContext, convex: ConvexService) async {
        phase = .loading
        do {
            // Calendar surface needs past events too so users can scroll
            // back through previous months. The view filters per day.
            async let eventsTask = convex.listEvents(upcomingOnly: false)
            async let membersTask = convex.listMembers()
            let (events, members) = try await (eventsTask, membersTask)
            self.events = events
            // Resolve the caller's member record by email (best-effort). The
            // member↔user link isn't exposed on currentContext, so we match on
            // the verified email from the user record.
            if let email = context.user.email?.lowercased() {
                myMemberId = members.first { $0.email?.lowercased() == email }?.id
            }
            phase = .loaded
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func setRsvp(event: Event, status: RsvpStatus, convex: ConvexService) async {
        guard let memberId = myMemberId else {
            actionError = "We couldn't find your member record to RSVP. Ask a committee member to link your account."
            return
        }
        busyEventId = event.id
        actionError = nil
        defer { busyEventId = nil }
        let previous = selection[event.id]
        selection[event.id] = status // optimistic
        do {
            try await convex.setRsvp(eventId: event.id, memberId: memberId, status: status)
        } catch {
            selection[event.id] = previous // rollback
            actionError = error.localizedDescription
        }
    }
}

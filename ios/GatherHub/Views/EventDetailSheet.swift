import SwiftUI

/// Slide-up sheet shown when a user taps an event in the calendar.
/// Renders the full set of fields the list row can't fit: start/end
/// times, location, opponent, team, description/notes, going count
/// and a wide RSVP control. Uses iOS 16+ `.presentationDetents`
/// so the user can peek (medium) or expand to read long notes (large).
struct EventDetailSheet: View {
    let event: Event
    let selection: RsvpStatus?
    let busy: Bool
    let canRsvp: Bool
    let onRsvp: (RsvpStatus) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: GHSpacing.xl) {
                    headerBlock
                    timeBlock
                    locationBlock
                    if let teamName = event.teamName {
                        GHCard(padding: GHSpacing.lg) {
                            HStack(spacing: GHSpacing.md) {
                                Image(systemName: "person.3")
                                    .foregroundStyle(Color.gh.inkSoft)
                                Text(teamName)
                                    .font(.gh.body)
                                    .foregroundStyle(Color.gh.ink)
                            }
                        }
                    }
                    if let description = event.description, !description.isEmpty {
                        descriptionBlock(description)
                    }
                    if canRsvp {
                        rsvpBlock
                    }
                    Spacer(minLength: GHSpacing.huge)
                }
                .padding(GHSpacing.pageInset)
            }
            .background(Color.gh.paper.ignoresSafeArea())
            .navigationTitle("Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: Blocks

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: GHSpacing.md) {
            HStack(spacing: GHSpacing.sm) {
                Label(event.type.displayName, systemImage: event.type.systemImage)
                    .font(.gh.caption.weight(.semibold))
                    .foregroundStyle(Color.gh.inkQuiet)
                if let going = event.goingCount {
                    Spacer()
                    Text("\(going) going")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            Text(event.title)
                .font(.gh.headline)
                .foregroundStyle(Color.gh.inkStrong)
            if let opponent = event.opponent, !opponent.isEmpty {
                Text("vs \(opponent)")
                    .font(.gh.body)
                    .foregroundStyle(Color.gh.inkSoft)
            }
        }
    }

    private var timeBlock: some View {
        GHCard(padding: GHSpacing.lg) {
            VStack(alignment: .leading, spacing: GHSpacing.sm) {
                Text("When").ghLabelStyle()
                HStack(spacing: GHSpacing.md) {
                    Image(systemName: "clock")
                        .foregroundStyle(Color.gh.inkSoft)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(event.startDate.formatted(date: .complete, time: .shortened))
                            .font(.gh.body)
                            .foregroundStyle(Color.gh.inkStrong)
                        if let endDate = event.endDate {
                            Text("until " + endLabel(endDate))
                                .font(.gh.caption)
                                .foregroundStyle(Color.gh.inkSoft)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var locationBlock: some View {
        if let location = event.location, !location.isEmpty {
            GHCard(padding: GHSpacing.lg) {
                VStack(alignment: .leading, spacing: GHSpacing.sm) {
                    Text("Where").ghLabelStyle()
                    HStack(spacing: GHSpacing.md) {
                        Image(systemName: "mappin.and.ellipse")
                            .foregroundStyle(Color.gh.inkSoft)
                        Text(location)
                            .font(.gh.body)
                            .foregroundStyle(Color.gh.inkStrong)
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }

    private func descriptionBlock(_ text: String) -> some View {
        GHCard(padding: GHSpacing.lg) {
            VStack(alignment: .leading, spacing: GHSpacing.sm) {
                Text("Notes").ghLabelStyle()
                Text(text)
                    .font(.gh.body)
                    .foregroundStyle(Color.gh.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
        }
    }

    private func endLabel(_ end: Date) -> String {
        let sameDay = Calendar.current.isDate(
            end,
            inSameDayAs: event.startDate
        )
        return sameDay
            ? end.formatted(date: .omitted, time: .shortened)
            : end.formatted(date: .abbreviated, time: .shortened)
    }

    private var rsvpBlock: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            Text("Your RSVP").ghLabelStyle()
            HStack(spacing: GHSpacing.sm) {
                ForEach(RsvpStatus.allCases, id: \.self) { status in
                    Button {
                        onRsvp(status)
                    } label: {
                        Text(status.displayName)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.gh(
                        selection == status ? .primary : .outline,
                        size: .md
                    ))
                    .disabled(busy)
                }
            }
        }
    }
}


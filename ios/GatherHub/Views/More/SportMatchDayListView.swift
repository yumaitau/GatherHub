import SwiftUI

struct SportMatchDayListView: View {
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment

    let canEdit: Bool

    @State private var squads: [MatchSquad] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load match day",
                    message: error,
                    retry: load
                )
            } else if squads.isEmpty {
                EmptyStateView(
                    title: "No match-day sheets",
                    systemImage: "list.clipboard",
                    message: "Saved team sheets will appear here."
                )
            } else {
                List {
                    ForEach(sortedSquads) { squad in
                        Section {
                            ForEach(squad.members) { member in
                                MatchDayMemberRow(
                                    member: member,
                                    template: squad.template,
                                    canEdit: canEdit,
                                    onPatch: { payload in
                                        queue(payload, squadId: squad.id, memberName: member.memberName)
                                    }
                                )
                            }
                        } header: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(squad.teamName)
                                Text(sectionSubtitle(for: squad))
                                    .font(.gh.caption)
                                    .foregroundStyle(Color.gh.inkQuiet)
                            }
                            .textCase(nil)
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .refreshable { await load() }
            }
        }
        .navigationTitle("Match day")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var sortedSquads: [MatchSquad] {
        squads.sorted {
            let leftTime = $0.fixtureStartTime ?? 0
            let rightTime = $1.fixtureStartTime ?? 0
            if leftTime != rightTime { return leftTime < rightTime }
            return $0.teamName < $1.teamName
        }
    }

    private func sectionSubtitle(for squad: MatchSquad) -> String {
        let date = squad.fixtureDate?.formatted(date: .abbreviated, time: .shortened)
        return [squad.fixtureTitle, date, squad.template.label]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " / ")
    }

    private func load() async {
        let hasCachedRows = (try? sync.store?.hasCachedMatchDaySquads()) ?? false
        if hasCachedRows {
            squads = (try? sync.store?.cachedMatchDaySquads()) ?? []
            loading = false
        } else if squads.isEmpty {
            loading = true
        }
        error = nil

        do {
            let freshRows = try await convex.listMatchDaySquads(upcomingOnly: false)
            squads = freshRows
            try? sync.store?.replaceMatchDaySquads(freshRows)
        } catch let err {
            if !hasCachedRows && squads.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load match-day sheets.")
            }
        }
        loading = false
    }

    private func queue(_ payload: MatchParticipationPayload, squadId: String, memberName: String) {
        apply(payload, squadId: squadId)
        do {
            try sync.enqueue(
                kind: .matchParticipationUpdate,
                title: "Match day: \(memberName)",
                payload: payload
            )
            Task { await sync.coordinator?.syncIfOnline() }
        } catch {
            self.error = UserFacingError.message(error, fallback: "Couldn't queue match-day update.")
        }
    }

    private func apply(_ payload: MatchParticipationPayload, squadId: String) {
        guard let squadIndex = squads.firstIndex(where: { $0.id == squadId }),
              let memberIndex = squads[squadIndex].members.firstIndex(where: { $0.id == payload.squadMemberId })
        else { return }

        if payload.isCaptain == true {
            for index in squads[squadIndex].members.indices {
                squads[squadIndex].members[index].isCaptain = false
            }
        }
        if payload.isViceCaptain == true {
            for index in squads[squadIndex].members.indices {
                squads[squadIndex].members[index].isViceCaptain = false
            }
        }

        var member = squads[squadIndex].members[memberIndex]
        if let participationStatus = payload.participationStatus {
            member.participationStatus = participationStatus
        }
        if let positionKey = payload.positionKey,
           let position = squads[squadIndex].template.positions.first(where: { $0.key == positionKey }) {
            member.positionKey = position.key
            member.positionLabel = position.label
        }
        if let jerseyNumber = payload.jerseyNumber {
            member.jerseyNumber = cleaned(jerseyNumber)
        }
        if let bibNumber = payload.bibNumber {
            member.bibNumber = cleaned(bibNumber)
        }
        if let isCaptain = payload.isCaptain {
            member.isCaptain = isCaptain
        }
        if let isViceCaptain = payload.isViceCaptain {
            member.isViceCaptain = isViceCaptain
        }
        if let notes = payload.notes {
            member.notes = cleaned(notes)
        }
        squads[squadIndex].members[memberIndex] = member
        try? sync.store?.replaceMatchDaySquads(squads)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct MatchDayMemberRow: View {
    let member: MatchSquadMember
    let template: SportRosterTemplate
    let canEdit: Bool
    let onPatch: (MatchParticipationPayload) -> Void

    @State private var numberText: String

    init(
        member: MatchSquadMember,
        template: SportRosterTemplate,
        canEdit: Bool,
        onPatch: @escaping (MatchParticipationPayload) -> Void
    ) {
        self.member = member
        self.template = template
        self.canEdit = canEdit
        self.onPatch = onPatch
        _numberText = State(initialValue: member.displayNumber ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            HStack(alignment: .top, spacing: GHSpacing.md) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(member.memberName)
                        .font(.gh.bodyStrong)
                        .foregroundStyle(Color.gh.inkStrong)
                    HStack(spacing: GHSpacing.sm) {
                        GHBadge(text: member.participationStatus.displayName, variant: badgeVariant)
                        if let position = member.positionLabel {
                            GHBadge(text: position, variant: .outline)
                        }
                        if member.isCaptain == true {
                            GHBadge(text: "Captain", variant: .warning)
                        } else if member.isViceCaptain == true {
                            GHBadge(text: "Vice", variant: .muted)
                        }
                    }
                }
                Spacer(minLength: GHSpacing.md)
                if canEdit {
                    statusMenu
                }
            }

            if canEdit {
                HStack(spacing: GHSpacing.sm) {
                    positionMenu
                    TextField(template.jerseyLabel.capitalized, text: $numberText)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numbersAndPunctuation)
                        .frame(width: 92)
                        .onSubmit(queueNumber)
                        .onChange(of: member.displayNumber ?? "") { _, newValue in
                            if numberText != newValue { numberText = newValue }
                        }
                    Button {
                        onPatch(payload(isCaptain: !(member.isCaptain ?? false)))
                    } label: {
                        Image(systemName: member.isCaptain == true ? "crown.fill" : "crown")
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Toggle captain")
                    Button("VC") {
                        onPatch(payload(isViceCaptain: !(member.isViceCaptain ?? false)))
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Toggle vice captain")
                }
            }
        }
        .padding(.vertical, GHSpacing.xs)
    }

    private var statusMenu: some View {
        Menu {
            ForEach(MatchParticipationStatus.allCases) { status in
                Button(status.displayName) {
                    onPatch(payload(status: status))
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.title3)
        }
        .accessibilityLabel("Update status")
    }

    private var positionMenu: some View {
        Menu {
            ForEach(template.positions) { position in
                Button(position.label) {
                    onPatch(payload(positionKey: position.key))
                }
            }
        } label: {
            Label(member.positionLabel ?? "Position", systemImage: "rectangle.3.group")
                .lineLimit(1)
        }
        .buttonStyle(.bordered)
    }

    private var badgeVariant: GHBadge.Variant {
        switch member.participationStatus {
        case .arrived, .active:
            return .success
        case .selected, .bench:
            return .info
        case .substituted, .interchanged:
            return .warning
        case .unavailable, .injured:
            return .danger
        }
    }

    private func queueNumber() {
        if template.jerseyLabel == "bib" {
            onPatch(payload(bibNumber: numberText))
        } else {
            onPatch(payload(jerseyNumber: numberText))
        }
    }

    private func payload(
        status: MatchParticipationStatus? = nil,
        positionKey: String? = nil,
        jerseyNumber: String? = nil,
        bibNumber: String? = nil,
        isCaptain: Bool? = nil,
        isViceCaptain: Bool? = nil
    ) -> MatchParticipationPayload {
        MatchParticipationPayload(
            squadMemberId: member.id,
            participationStatus: status,
            positionKey: positionKey,
            jerseyNumber: jerseyNumber,
            bibNumber: bibNumber,
            isCaptain: isCaptain,
            isViceCaptain: isViceCaptain,
            notes: nil
        )
    }
}

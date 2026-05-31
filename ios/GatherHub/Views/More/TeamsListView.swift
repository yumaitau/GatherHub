import SwiftUI

/// Team roster index with offline-first create/edit/deactivate support.
struct TeamsListView: View {
    let canEdit: Bool
    let canDelete: Bool
    let soccerMode: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var teams: [Team] = []
    @State private var loading = true
    @State private var error: String?
    @State private var query = ""
    @State private var includeInactive = false
    @State private var ageGroup: String = "All"
    @State private var creatingTeam = false
    @State private var editingTeam: Team?
    @State private var deletingTeam: Team?

    init(canEdit: Bool = false, canDelete: Bool = false, soccerMode: Bool = false) {
        self.canEdit = canEdit
        self.canDelete = canDelete
        self.soccerMode = soccerMode
    }

    private var ageGroups: [String] {
        let set = Set(teams.compactMap { $0.ageGroup }).sorted()
        return ["All"] + set
    }

    private var filtered: [Team] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        var rows = teams
        if !includeInactive { rows = rows.filter { $0.isActive } }
        if ageGroup != "All" { rows = rows.filter { $0.ageGroup == ageGroup } }
        guard !q.isEmpty else { return rows }
        return rows.filter {
            $0.name.localizedStandardContains(q)
                || ($0.ageGroup ?? "").localizedStandardContains(q)
                || ($0.season ?? "").localizedStandardContains(q)
        }
    }

    private var activeFilterCount: Int {
        (includeInactive ? 1 : 0) + (ageGroup != "All" ? 1 : 0)
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading teams…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load teams",
                    message: error,
                    retry: load
                )
            } else if teams.isEmpty {
                EmptyStateView(
                    title: "No teams yet",
                    systemImage: "shield.lefthalf.filled",
                    message: canEdit
                        ? "Create the first team from this device."
                        : "Teams will appear here after they are added."
                )
            } else {
                List(filtered) { team in
                    NavigationLink {
                        TeamDetailView(team: team, canEdit: canEdit, canDelete: canDelete, soccerMode: soccerMode) { saved, shouldReload in
                            upsertLocal(saved)
                            if shouldReload {
                                Task { await load() }
                            }
                        } onDeleted: { deleted, shouldReload in
                            removeLocal(deleted.id)
                            if shouldReload {
                                Task { await load() }
                            }
                        }
                    } label: {
                        TeamRow(team: team)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if canEdit && !team.id.hasPrefix("local:") {
                            Button {
                                editingTeam = team
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(Color.gh.accent)
                        }
                        if canDelete {
                            Button(role: .destructive) {
                                deletingTeam = team
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Teams")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if canEdit {
                    Button {
                        creatingTeam = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add team")
                }
                Menu {
                    Toggle("Show inactive", isOn: $includeInactive)
                    Picker("Age group", selection: $ageGroup) {
                        ForEach(ageGroups, id: \.self) { Text($0).tag($0) }
                    }
                } label: {
                    Image(systemName: activeFilterCount > 0
                          ? "line.3.horizontal.decrease.circle.fill"
                          : "line.3.horizontal.decrease.circle")
                }
                .accessibilityLabel("Filter teams")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search team or age group"
        )
        .sheet(isPresented: $creatingTeam) {
            TeamEditorSheet(team: nil, soccerMode: soccerMode) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
        .sheet(item: $editingTeam) { team in
            TeamEditorSheet(team: team, soccerMode: soccerMode) { saved, shouldReload in
                upsertLocal(saved)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
        .confirmationDialog(
            "Delete this team?",
            isPresented: Binding(
                get: { deletingTeam != nil },
                set: { if !$0 { deletingTeam = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let team = deletingTeam {
                Button("Delete", role: .destructive) {
                    Task { await delete(team) }
                }
            }
        } message: {
            if let team = deletingTeam {
                Text(team.name)
            }
        }
    }

    private func load() async {
        let hasCachedTeams = (try? sync.store?.hasCachedTeams()) ?? false
        if hasCachedTeams {
            teams = (try? sync.store?.cachedTeams()) ?? []
            loading = false
        } else if teams.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listTeams(includeInactive: true)
            teams = fresh
            try? sync.store?.replaceTeams(fresh)
        } catch let err {
            if !hasCachedTeams && teams.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load teams.")
            }
        }
        loading = false
    }

    private func upsertLocal(_ team: Team) {
        if let index = teams.firstIndex(where: { $0.id == team.id }) {
            teams[index] = team
        } else {
            teams.append(team)
        }
        teams.sort { $0.name < $1.name }
        try? sync.store?.replaceTeams(teams)
    }

    private func removeLocal(_ teamId: String) {
        teams.removeAll { $0.id == teamId }
        try? sync.store?.replaceTeams(teams)
    }

    private func delete(_ team: Team) async {
        do {
            if team.id.hasPrefix("local:") {
                let clientId = String(team.id.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                removeLocal(team.id)
                sync.coordinator?.refreshUnsettledCount()
                return
            }
            let op = try sync.enqueue(
                kind: .teamDelete,
                title: "Delete \(team.name)",
                payload: TeamDeletePayload(teamId: team.id)
            )
            removeLocal(team.id)
            await sync.coordinator?.syncIfOnline()
            if op.status == .applied {
                await load()
            }
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue team deletion.")
        }
    }
}

private struct TeamRow: View {
    let team: Team

    var body: some View {
        HStack(spacing: GHSpacing.lg) {
            Image(systemName: "shield.lefthalf.filled")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Color.gh.accent)
                .frame(width: 40, height: 40)
                .background(Color.gh.accentWash)
                .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius))
            VStack(alignment: .leading, spacing: 2) {
                Text(team.name)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                HStack(spacing: GHSpacing.sm) {
                    if let ageGroup = team.ageGroup {
                        Text(ageGroup)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    }
                    Text("\(team.playerCount) players")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
            }
            Spacer()
            if team.id.hasPrefix("local:") {
                GHBadge(text: "Queued", variant: .warning)
            } else if !team.isActive {
                GHBadge(text: "Inactive", variant: .muted)
            }
        }
        .padding(.vertical, 2)
    }
}

struct TeamDetailView: View {
    @State private var team: Team
    let canEdit: Bool
    let canDelete: Bool
    let soccerMode: Bool
    let onSaved: (_ saved: Team, _ shouldReload: Bool) -> Void
    let onDeleted: (_ deleted: Team, _ shouldReload: Bool) -> Void
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var confirmingDelete = false
    @State private var error: String?

    init(
        team: Team,
        canEdit: Bool = false,
        canDelete: Bool = false,
        soccerMode: Bool = false,
        onSaved: @escaping (_ saved: Team, _ shouldReload: Bool) -> Void = { _, _ in },
        onDeleted: @escaping (_ deleted: Team, _ shouldReload: Bool) -> Void = { _, _ in }
    ) {
        self._team = State(initialValue: team)
        self.canEdit = canEdit
        self.canDelete = canDelete
        self.soccerMode = soccerMode
        self.onSaved = onSaved
        self.onDeleted = onDeleted
    }

    var body: some View {
        List {
            Section("Team") {
                LabeledContent("Name", value: team.name)
                if let ageGroup = team.ageGroup {
                    LabeledContent("Age group", value: ageGroup)
                }
                if let season = team.season {
                    LabeledContent("Season", value: season)
                }
                LabeledContent("Status", value: team.isActive ? "Active" : "Inactive")
                if let description = team.description {
                    Text(description)
                }
            }
            Section("Squad") {
                LabeledContent("Players", value: "\(team.playerCount)")
                LabeledContent("Staff", value: "\(team.staffCount)")
            }
            if soccerMode {
                Section("Kit") {
                    if let kitColour = team.kitColour {
                        LabeledContent("Colour", value: kitColour)
                    }
                    if let kitBagNumber = team.kitBagNumber {
                        LabeledContent("Bag", value: kitBagNumber)
                    }
                    if let registered = team.teamRegistered {
                        LabeledContent("Registered", value: registered ? "Yes" : "No")
                    }
                    if let paid = team.teamRegistrationPaid {
                        LabeledContent("Paid", value: paid ? "Yes" : "No")
                    }
                }
                Section("Contacts") {
                    teamContact("Coach", name: team.coach, email: team.coachEmail, phone: team.coachPhone)
                    teamContact(
                        "Additional coach",
                        name: team.additionalCoach,
                        email: team.additionalCoachEmail,
                        phone: team.additionalCoachPhone
                    )
                    teamContact("Manager", name: team.manager, email: team.managerEmail, phone: team.managerPhone)
                }
            }
            if let error {
                Section {
                    Text(error)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.danger)
                }
            }
            if canDelete {
                Section {
                    Button("Delete team", role: .destructive) {
                        confirmingDelete = true
                    }
                }
            }
        }
        .navigationTitle(team.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit && !team.id.hasPrefix("local:") {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") { editing = true }
                }
            }
        }
        .sheet(isPresented: $editing) {
            TeamEditorSheet(team: team, soccerMode: soccerMode) { saved, shouldReload in
                team = saved
                onSaved(saved, shouldReload)
            }
        }
        .confirmationDialog(
            "Delete this team?",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Task { await delete() }
            }
        } message: {
            Text(team.name)
        }
    }

    @ViewBuilder
    private func teamContact(_ label: String, name: String?, email: String?, phone: String?) -> some View {
        if name != nil || email != nil || phone != nil {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
                if let name { Text(name) }
                if let email { Text(email).foregroundStyle(Color.gh.inkSoft) }
                if let phone { Text(phone).foregroundStyle(Color.gh.inkSoft) }
            }
        }
    }

    private func delete() async {
        do {
            if team.id.hasPrefix("local:") {
                let clientId = String(team.id.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                sync.coordinator?.refreshUnsettledCount()
                onDeleted(team, false)
                dismiss()
                return
            }
            let op = try sync.enqueue(
                kind: .teamDelete,
                title: "Delete \(team.name)",
                payload: TeamDeletePayload(teamId: team.id)
            )
            await sync.coordinator?.syncIfOnline()
            onDeleted(team, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue team deletion.")
        }
    }
}

private struct TeamEditorSheet: View {
    let team: Team?
    let soccerMode: Bool
    let onSaved: (_ saved: Team, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var ageGroups: [TaxonomyOption] = []
    @State private var divisions: [SoccerDivision] = []
    @State private var competitions: [SoccerCompetition] = []
    @State private var name: String
    @State private var ageGroup: String
    @State private var season: String
    @State private var description: String
    @State private var isActive: Bool
    @State private var kitColour: String
    @State private var kitBagNumber: String
    @State private var competitionId: String
    @State private var divisionId: String
    @State private var coach: String
    @State private var coachEmail: String
    @State private var coachPhone: String
    @State private var additionalCoach: String
    @State private var additionalCoachEmail: String
    @State private var additionalCoachPhone: String
    @State private var manager: String
    @State private var managerEmail: String
    @State private var managerPhone: String
    @State private var teamRegistered: Bool
    @State private var teamRegisteredDate: String
    @State private var teamRegistrationPaid: Bool
    @State private var loadingOptions = false
    @State private var saving = false
    @State private var error: String?

    init(
        team: Team?,
        soccerMode: Bool,
        onSaved: @escaping (_ saved: Team, _ shouldReload: Bool) -> Void
    ) {
        self.team = team
        self.soccerMode = soccerMode
        self.onSaved = onSaved
        self._name = State(initialValue: team?.name ?? "")
        self._ageGroup = State(initialValue: team?.ageGroup ?? "")
        self._season = State(initialValue: team?.season ?? "")
        self._description = State(initialValue: team?.description ?? "")
        self._isActive = State(initialValue: team?.isActive ?? true)
        self._kitColour = State(initialValue: team?.kitColour ?? "")
        self._kitBagNumber = State(initialValue: team?.kitBagNumber ?? "")
        self._competitionId = State(initialValue: team?.competitionId ?? "")
        self._divisionId = State(initialValue: team?.divisionId ?? "")
        self._coach = State(initialValue: team?.coach ?? "")
        self._coachEmail = State(initialValue: team?.coachEmail ?? "")
        self._coachPhone = State(initialValue: team?.coachPhone ?? "")
        self._additionalCoach = State(initialValue: team?.additionalCoach ?? "")
        self._additionalCoachEmail = State(initialValue: team?.additionalCoachEmail ?? "")
        self._additionalCoachPhone = State(initialValue: team?.additionalCoachPhone ?? "")
        self._manager = State(initialValue: team?.manager ?? "")
        self._managerEmail = State(initialValue: team?.managerEmail ?? "")
        self._managerPhone = State(initialValue: team?.managerPhone ?? "")
        self._teamRegistered = State(initialValue: team?.teamRegistered ?? false)
        self._teamRegisteredDate = State(initialValue: team?.teamRegisteredDate ?? "")
        self._teamRegistrationPaid = State(initialValue: team?.teamRegistrationPaid ?? false)
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
                Section("Team") {
                    TextField("Name", text: $name)
                    Picker("Age group", selection: $ageGroup) {
                        Text("None").tag("")
                        ForEach(ageGroups) { option in
                            Text(option.label).tag(option.key)
                        }
                    }
                    TextField("Season", text: $season)
                        .keyboardType(.numbersAndPunctuation)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                    if team != nil {
                        Toggle("Active", isOn: $isActive)
                    }
                }
                if soccerMode {
                    Section("Soccer") {
                        Picker("Competition", selection: $competitionId) {
                            Text("None").tag("")
                            ForEach(competitions.filter(\.active)) { competition in
                                Text(competition.name).tag(competition.id)
                            }
                        }
                        Picker("Division", selection: $divisionId) {
                            Text("None").tag("")
                            ForEach(divisions.filter(\.active)) { division in
                                Text(division.name).tag(division.id)
                            }
                        }
                        TextField("Kit colour", text: $kitColour)
                            .textInputAutocapitalization(.never)
                        TextField("Kit bag number", text: $kitBagNumber)
                        Toggle("Team registered", isOn: $teamRegistered)
                        Toggle("Registration paid", isOn: $teamRegistrationPaid)
                        TextField("Registered date (YYYY-MM-DD)", text: $teamRegisteredDate)
                            .keyboardType(.numbersAndPunctuation)
                    }
                    Section("Coach") {
                        TextField("Name", text: $coach)
                        TextField("Email", text: $coachEmail)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                        TextField("Phone", text: $coachPhone)
                            .keyboardType(.phonePad)
                    }
                    Section("Additional coach") {
                        TextField("Name", text: $additionalCoach)
                        TextField("Email", text: $additionalCoachEmail)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                        TextField("Phone", text: $additionalCoachPhone)
                            .keyboardType(.phonePad)
                    }
                    Section("Manager") {
                        TextField("Name", text: $manager)
                        TextField("Email", text: $managerEmail)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                        TextField("Phone", text: $managerPhone)
                            .keyboardType(.phonePad)
                    }
                }
            }
            .overlay {
                if loadingOptions {
                    ProgressView()
                }
            }
            .navigationTitle(team == nil ? "New team" : "Edit team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .disabled(saving)
                }
            }
            .task { await loadOptions() }
        }
    }

    private func loadOptions() async {
        if (try? sync.store?.hasCachedTeamAgeGroups()) == true {
            ageGroups = ((try? sync.store?.cachedTeamAgeGroups()) ?? []).filter { $0.active ?? true }
        }
        if soccerMode {
            if (try? sync.store?.hasCachedSoccerDivisions()) == true {
                divisions = (try? sync.store?.cachedSoccerDivisions()) ?? []
            }
            if (try? sync.store?.hasCachedSoccerCompetitions()) == true {
                competitions = (try? sync.store?.cachedSoccerCompetitions()) ?? []
            }
        }
        loadingOptions = ageGroups.isEmpty && soccerMode && divisions.isEmpty
        defer { loadingOptions = false }
        do {
            let ageGroupRows = try await convex.listTeamAgeGroups(includeInactive: true)
            ageGroups = ageGroupRows.filter { $0.active ?? true }
            try? sync.store?.replaceTeamAgeGroups(ageGroupRows)
            if soccerMode {
                async let divisionTask = convex.listSoccerDivisions()
                async let competitionTask = convex.listSoccerCompetitions()
                let (divisionRows, competitionRows) = try await (divisionTask, competitionTask)
                divisions = divisionRows
                competitions = competitionRows
                try? sync.store?.replaceSoccerDivisions(divisionRows)
                try? sync.store?.replaceSoccerCompetitions(competitionRows)
            }
        } catch {
            // Cached options are enough to keep the form usable offline.
        }
    }

    private func save() async {
        let teamName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !teamName.isEmpty else {
            error = "Team name is required."
            return
        }
        saving = true
        defer { saving = false }
        error = nil

        let payload = TeamMutationPayload(
            name: teamName,
            ageGroup: cleaned(ageGroup),
            season: cleaned(season),
            description: cleaned(description),
            isActive: isActive,
            kitColour: cleaned(kitColour),
            kitBagNumber: cleaned(kitBagNumber),
            competitionId: cleaned(competitionId),
            divisionId: cleaned(divisionId),
            coach: cleaned(coach),
            coachEmail: cleaned(coachEmail),
            coachPhone: cleaned(coachPhone),
            additionalCoach: cleaned(additionalCoach),
            additionalCoachEmail: cleaned(additionalCoachEmail),
            additionalCoachPhone: cleaned(additionalCoachPhone),
            manager: cleaned(manager),
            managerEmail: cleaned(managerEmail),
            managerPhone: cleaned(managerPhone),
            teamRegistered: soccerMode ? teamRegistered : nil,
            teamRegisteredDate: cleaned(teamRegisteredDate),
            teamRegistrationPaid: soccerMode ? teamRegistrationPaid : nil
        )

        do {
            let op: PendingSyncOperation
            let saved: Team
            if let team {
                op = try sync.enqueue(
                    kind: .teamUpdate,
                    title: "Update \(teamName)",
                    payload: TeamUpdatePayload(teamId: team.id, team: payload)
                )
                saved = makeTeam(id: team.id, payload: payload, playerCount: team.playerCount, staffCount: team.staffCount)
                updateCachedTeam(saved)
            } else {
                op = try sync.enqueue(
                    kind: .teamCreate,
                    title: "Create \(teamName)",
                    payload: payload
                )
                saved = makeTeam(id: "local:\(op.clientId)", payload: payload, playerCount: 0, staffCount: 0)
                updateCachedTeam(saved)
            }
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue team change.")
        }
    }

    private func makeTeam(id: String, payload: TeamMutationPayload, playerCount: Int, staffCount: Int) -> Team {
        Team(
            id: id,
            name: payload.name,
            ageGroup: payload.ageGroup,
            season: payload.season,
            description: payload.description,
            isActive: payload.isActive,
            kitColour: payload.kitColour,
            kitBagNumber: payload.kitBagNumber,
            competitionId: payload.competitionId,
            divisionId: payload.divisionId,
            coach: payload.coach,
            coachEmail: payload.coachEmail,
            coachPhone: payload.coachPhone,
            additionalCoach: payload.additionalCoach,
            additionalCoachEmail: payload.additionalCoachEmail,
            additionalCoachPhone: payload.additionalCoachPhone,
            manager: payload.manager,
            managerEmail: payload.managerEmail,
            managerPhone: payload.managerPhone,
            teamRegistered: payload.teamRegistered,
            teamRegisteredDate: payload.teamRegisteredDate,
            teamRegistrationPaid: payload.teamRegistrationPaid,
            playerCount: playerCount,
            staffCount: staffCount
        )
    }

    private func updateCachedTeam(_ team: Team) {
        var rows = (try? sync.store?.cachedTeams()) ?? []
        if let index = rows.firstIndex(where: { $0.id == team.id }) {
            rows[index] = team
        } else {
            rows.append(team)
        }
        rows.sort { $0.name < $1.name }
        try? sync.store?.replaceTeams(rows)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

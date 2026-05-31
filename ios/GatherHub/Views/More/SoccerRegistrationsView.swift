import SwiftUI

/// Match-day registration lookup and offline-first registrar capture.
struct SoccerRegistrationsView: View {
    let canEdit: Bool

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var rows: [PlayerListingRow] = []
    @State private var loading = true
    @State private var error: String?
    @State private var query = ""
    @State private var filter: StatusFilter = .all
    @State private var team: String = "All"
    @State private var division: String = "All"
    @State private var paymentPlanOnly = false
    @State private var editingRow: PlayerListingRow?
    @State private var creatingRegistration = false
    @State private var deletingRow: PlayerListingRow?

    init(canEdit: Bool = false) {
        self.canEdit = canEdit
    }

    enum StatusFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case unregistered = "No rego"
        case pending = "Pending"
        case active = "Active"
        case unpaid = "Unpaid"
        case plan = "Plan"
        var id: String { rawValue }
    }

    private var teamOptions: [String] {
        let set = Set(rows.compactMap { $0.teamName }).sorted()
        return ["All"] + set
    }

    private var divisionOptions: [String] {
        let set = Set(rows.compactMap { $0.divisionName }).sorted()
        return ["All"] + set
    }

    private var activeFilterCount: Int {
        (team != "All" ? 1 : 0)
            + (division != "All" ? 1 : 0)
            + (paymentPlanOnly ? 1 : 0)
    }

    private var filtered: [PlayerListingRow] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        var data = rows
        switch filter {
        case .all: break
        case .unregistered: data = data.filter { !$0.hasRegistration }
        case .pending: data = data.filter { $0.hasRegistration && !$0.registered }
        case .active: data = data.filter { $0.registered && $0.paid }
        case .unpaid: data = data.filter { $0.registered && !$0.paid && !$0.paymentPlan }
        case .plan: data = data.filter { $0.paymentPlan }
        }
        if team != "All" { data = data.filter { $0.teamName == team } }
        if division != "All" { data = data.filter { $0.divisionName == division } }
        if paymentPlanOnly { data = data.filter { $0.paymentPlan } }
        if !q.isEmpty {
            data = data.filter {
                $0.name.localizedStandardContains(q)
                    || ($0.email ?? "").localizedStandardContains(q)
                    || ($0.ffaNumber ?? "").localizedStandardContains(q)
                    || ($0.teamName ?? "").localizedStandardContains(q)
            }
        }
        return data
    }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load",
                    message: error,
                    retry: load
                )
            } else {
                content
            }
        }
        .navigationTitle("Registrations")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if canEdit {
                    Button {
                        creatingRegistration = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New field registration")
                }
                Menu {
                    Picker("Team", selection: $team) {
                        ForEach(teamOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Division", selection: $division) {
                        ForEach(divisionOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Toggle("Payment plan only", isOn: $paymentPlanOnly)
                } label: {
                    Image(systemName: activeFilterCount > 0
                          ? "line.3.horizontal.decrease.circle.fill"
                          : "line.3.horizontal.decrease.circle")
                }
                .accessibilityLabel("Filter registrations")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search player, FFA, team"
        )
        .sheet(item: $editingRow) { row in
            PlayerRegistrationEditorSheet(row: row) { updated, shouldReload in
                upsertLocal(updated)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
        .sheet(isPresented: $creatingRegistration) {
            PlayerRegistrationEditorSheet(row: nil) { updated, shouldReload in
                upsertLocal(updated)
                if shouldReload {
                    Task { await load() }
                }
            }
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: GHSpacing.sm) {
                    ForEach(StatusFilter.allCases) { f in
                        Button {
                            filter = f
                        } label: {
                            Text(f.rawValue)
                        }
                        .buttonStyle(.gh(filter == f ? .primary : .outline, size: .sm))
                    }
                }
                .padding(.horizontal, GHSpacing.pageInset)
                .padding(.vertical, GHSpacing.md)
            }
            .background(Color.gh.surface)
            Divider()
            List(filtered) { row in
                Button {
                    if canEdit && !row.memberId.hasPrefix("local:") {
                        editingRow = row
                    }
                } label: {
                    RegistrationRow(row: row)
                }
                .buttonStyle(.plain)
                .disabled(!canEdit || row.memberId.hasPrefix("local:"))
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    if canEdit {
                        if !row.memberId.hasPrefix("local:") {
                            Button {
                                editingRow = row
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            .tint(Color.gh.accent)
                        }

                        if row.hasRegistration || row.memberId.hasPrefix("local:") {
                            Button(role: .destructive) {
                                deletingRow = row
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
        }
        .confirmationDialog(
            "Delete this registration?",
            isPresented: Binding(
                get: { deletingRow != nil },
                set: { if !$0 { deletingRow = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let row = deletingRow {
                Button("Delete", role: .destructive) {
                    Task { await delete(row) }
                }
            }
        } message: {
            if let row = deletingRow {
                Text(row.name)
            }
        }
    }

    private func load() async {
        let hasCachedPlayerListings = (try? sync.store?.hasCachedPlayerListings()) ?? false
        if hasCachedPlayerListings {
            rows = (try? sync.store?.cachedPlayerListings()) ?? []
            loading = false
        } else if rows.isEmpty {
            loading = true
        }
        error = nil
        do {
            let fresh = try await convex.listPlayerRegistrations()
            rows = fresh
            try? sync.store?.replacePlayerListings(fresh)
        } catch let err {
            if !hasCachedPlayerListings && rows.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load registrations.")
            }
        }
        loading = false
    }

    private func upsertLocal(_ row: PlayerListingRow) {
        if let index = rows.firstIndex(where: { $0.memberId == row.memberId }) {
            rows[index] = row
        } else {
            rows.append(row)
        }
        rows.sort { $0.name < $1.name }
        try? sync.store?.replacePlayerListings(rows)
    }

    private func removeLocal(_ memberId: String) {
        rows.removeAll { $0.memberId == memberId }
        try? sync.store?.replacePlayerListings(rows)
    }

    private func delete(_ row: PlayerListingRow) async {
        do {
            if row.memberId.hasPrefix("local:") {
                let clientId = String(row.memberId.dropFirst("local:".count))
                try sync.store?.deleteOperation(clientId: clientId)
                removeLocal(row.memberId)
                removeCachedMember(row.memberId)
                sync.coordinator?.refreshUnsettledCount()
                return
            }
            let op = try sync.enqueue(
                kind: .soccerRegistrationDelete,
                title: "Delete registration for \(row.name)",
                payload: RegistrationDeletePayload(memberId: row.memberId)
            )
            upsertLocal(clearedRegistration(row))
            await sync.coordinator?.syncIfOnline()
            if op.status == .applied {
                await load()
            }
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue registration deletion.")
        }
    }

    private func removeCachedMember(_ memberId: String) {
        var members = (try? sync.store?.cachedMembers()) ?? []
        members.removeAll { $0.id == memberId }
        try? sync.store?.replaceMembers(members)
    }

    private func clearedRegistration(_ row: PlayerListingRow) -> PlayerListingRow {
        PlayerListingRow(
            memberId: row.memberId,
            name: row.name,
            email: row.email,
            dateOfBirth: row.dateOfBirth,
            hasRegistration: false,
            registered: false,
            registeredAt: nil,
            paid: false,
            paidAt: nil,
            paymentPlan: false,
            paymentPlanStart: nil,
            paymentPlanEnd: nil,
            ffaNumber: nil,
            gender: nil,
            schoolName: nil,
            comments: nil,
            competitionId: nil,
            ageGroupKey: nil,
            teamId: nil,
            teamName: nil,
            divisionId: nil,
            divisionName: nil,
            divisionColor: nil,
            kitColour: nil,
            grade: row.grade
        )
    }
}

private struct RegistrationRow: View {
    let row: PlayerListingRow

    var body: some View {
        HStack(alignment: .top, spacing: GHSpacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                HStack(spacing: GHSpacing.sm) {
                    if let team = row.teamName {
                        Text(team)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    }
                    if let division = row.divisionName {
                        Text("·")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                        Text(division)
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    }
                }
                if let ffa = row.ffaNumber {
                    Text("FFA \(ffa)")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                        .monospaced()
                }
            }
            Spacer()
            statusBadge
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var statusBadge: some View {
        if row.memberId.hasPrefix("local:") {
            GHBadge(text: "Queued", variant: .warning)
        } else if !row.hasRegistration {
            GHBadge(text: "No rego", variant: .outline)
        } else if row.registered && row.paid {
            GHBadge(text: "Active", variant: .success)
        } else if row.registered && row.paymentPlan {
            GHBadge(text: "Plan", variant: .warning)
        } else if row.registered {
            GHBadge(text: "Unpaid", variant: .danger)
        } else {
            GHBadge(text: "Pending", variant: .muted)
        }
    }
}

private struct PlayerRegistrationEditorSheet: View {
    let row: PlayerListingRow?
    let onSaved: (_ saved: PlayerListingRow, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var teams: [Team] = []
    @State private var divisions: [SoccerDivision] = []
    @State private var competitions: [SoccerCompetition] = []
    @State private var ageGroups: [TaxonomyOption] = []
    @State private var loadingOptions = false
    @State private var saving = false
    @State private var error: String?

    @State private var firstName: String
    @State private var lastName: String
    @State private var email: String
    @State private var phone: String
    @State private var dateOfBirth: String
    @State private var notes: String
    @State private var guardianFirstName = ""
    @State private var guardianLastName = ""
    @State private var guardianEmail = ""
    @State private var guardianPhone = ""
    @State private var guardianRelationship = ""
    @State private var emergencyName = ""
    @State private var emergencyRelationship = ""
    @State private var emergencyPhone = ""
    @State private var emergencyEmail = ""

    @State private var competitionId: String
    @State private var teamId: String
    @State private var divisionId: String
    @State private var ageGroupKey: String
    @State private var ffaNumber: String
    @State private var gender: String
    @State private var schoolName: String
    @State private var registered: Bool
    @State private var paid: Bool
    @State private var paymentPlan: Bool
    @State private var paymentPlanStart: String
    @State private var paymentPlanEnd: String
    @State private var comments: String
    @State private var kitColour: String

    init(
        row: PlayerListingRow?,
        onSaved: @escaping (_ saved: PlayerListingRow, _ shouldReload: Bool) -> Void
    ) {
        self.row = row
        self.onSaved = onSaved
        let nameParts = row?.name.split(separator: " ", maxSplits: 1).map(String.init) ?? []
        self._firstName = State(initialValue: nameParts.first ?? "")
        self._lastName = State(initialValue: nameParts.dropFirst().first ?? "")
        self._email = State(initialValue: row?.email ?? "")
        self._phone = State(initialValue: "")
        self._dateOfBirth = State(initialValue: row?.dateOfBirth ?? "")
        self._notes = State(initialValue: "")
        self._competitionId = State(initialValue: row?.competitionId ?? "")
        self._teamId = State(initialValue: row?.teamId ?? "")
        self._divisionId = State(initialValue: row?.divisionId ?? "")
        self._ageGroupKey = State(initialValue: row?.ageGroupKey ?? "")
        self._ffaNumber = State(initialValue: row?.ffaNumber ?? "")
        self._gender = State(initialValue: row?.gender ?? "")
        self._schoolName = State(initialValue: row?.schoolName ?? "")
        self._registered = State(initialValue: row?.registered ?? true)
        self._paid = State(initialValue: row?.paid ?? false)
        self._paymentPlan = State(initialValue: row?.paymentPlan ?? false)
        self._paymentPlanStart = State(initialValue: row?.paymentPlanStart ?? "")
        self._paymentPlanEnd = State(initialValue: row?.paymentPlanEnd ?? "")
        self._comments = State(initialValue: row?.comments ?? "")
        self._kitColour = State(initialValue: row?.kitColour ?? "")
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
                if row == nil {
                    playerSection
                    guardianSection
                    emergencySection
                }
                registrationSection
                paymentSection
                Section("Comments") {
                    TextField("Comments", text: $comments, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .overlay {
                if loadingOptions {
                    ProgressView()
                }
            }
            .navigationTitle(row == nil ? "New registration" : "Edit registration")
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
        .presentationDetents([.large])
    }

    private var playerSection: some View {
        Section("Player") {
            TextField("First name", text: $firstName)
                .textContentType(.givenName)
            TextField("Last name", text: $lastName)
                .textContentType(.familyName)
            TextField("Date of birth (YYYY-MM-DD)", text: $dateOfBirth)
                .keyboardType(.numbersAndPunctuation)
            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
            TextField("Phone", text: $phone)
                .keyboardType(.phonePad)
            TextField("Notes", text: $notes, axis: .vertical)
                .lineLimit(2...4)
        }
    }

    private var guardianSection: some View {
        Section("Parent / guardian") {
            TextField("First name", text: $guardianFirstName)
            TextField("Last name", text: $guardianLastName)
            TextField("Relationship", text: $guardianRelationship)
            TextField("Email", text: $guardianEmail)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
            TextField("Phone", text: $guardianPhone)
                .keyboardType(.phonePad)
        }
    }

    private var emergencySection: some View {
        Section("Emergency contact") {
            TextField("Name", text: $emergencyName)
            TextField("Relationship", text: $emergencyRelationship)
            TextField("Phone", text: $emergencyPhone)
                .keyboardType(.phonePad)
            TextField("Email", text: $emergencyEmail)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
        }
    }

    private var registrationSection: some View {
        Section("Registration") {
            if let row {
                LabeledContent("Player", value: row.name)
            }
            Picker("Competition", selection: $competitionId) {
                Text("None").tag("")
                ForEach(competitions.filter(\.active)) { competition in
                    Text(competition.name).tag(competition.id)
                }
            }
            Picker("Age group", selection: $ageGroupKey) {
                Text("None").tag("")
                ForEach(ageGroups.filter { $0.active ?? true }) { ageGroup in
                    Text(ageGroup.label).tag(ageGroup.key)
                }
            }
            Picker("Team", selection: $teamId) {
                Text("Unassigned").tag("")
                ForEach(teams.filter(\.isActive)) { team in
                    Text(team.name).tag(team.id)
                }
            }
            Picker("Division", selection: $divisionId) {
                Text("Auto (from grade)").tag("")
                ForEach(divisions.filter(\.active)) { division in
                    Text(division.name).tag(division.id)
                }
            }
            TextField("FFA number", text: $ffaNumber)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Picker("Gender", selection: $gender) {
                Text("None").tag("")
                Text("Female").tag("female")
                Text("Male").tag("male")
                Text("Unspecified").tag("unspecified")
            }
            TextField("School", text: $schoolName)
            TextField("Kit colour", text: $kitColour)
                .textInputAutocapitalization(.never)
        }
    }

    private var paymentSection: some View {
        Section("Status") {
            Toggle("Registered", isOn: $registered)
            Toggle("Paid", isOn: $paid)
            Toggle("Payment plan", isOn: $paymentPlan)
            if paymentPlan {
                TextField("Plan start (YYYY-MM-DD)", text: $paymentPlanStart)
                    .keyboardType(.numbersAndPunctuation)
                TextField("Plan end (YYYY-MM-DD)", text: $paymentPlanEnd)
                    .keyboardType(.numbersAndPunctuation)
            }
        }
    }

    private func loadOptions() async {
        let hasCachedTeams = (try? sync.store?.hasCachedTeams()) ?? false
        let hasCachedDivisions = (try? sync.store?.hasCachedSoccerDivisions()) ?? false
        let hasCachedCompetitions = (try? sync.store?.hasCachedSoccerCompetitions()) ?? false
        let hasCachedAgeGroups = (try? sync.store?.hasCachedTeamAgeGroups()) ?? false
        if hasCachedTeams { teams = (try? sync.store?.cachedTeams()) ?? [] }
        if hasCachedDivisions { divisions = (try? sync.store?.cachedSoccerDivisions()) ?? [] }
        if hasCachedCompetitions { competitions = (try? sync.store?.cachedSoccerCompetitions()) ?? [] }
        if hasCachedAgeGroups { ageGroups = (try? sync.store?.cachedTeamAgeGroups()) ?? [] }
        loadingOptions = !(hasCachedTeams && hasCachedDivisions && hasCachedAgeGroups)
        defer { loadingOptions = false }
        do {
            async let teamTask = convex.listTeams(includeInactive: true)
            async let divisionTask = convex.listSoccerDivisions()
            async let competitionTask = convex.listSoccerCompetitions()
            async let ageGroupTask = convex.listTeamAgeGroups(includeInactive: true)
            let (teamRows, divisionRows, competitionRows, ageGroupRows) = try await (
                teamTask,
                divisionTask,
                competitionTask,
                ageGroupTask
            )
            teams = teamRows
            divisions = divisionRows
            competitions = competitionRows
            ageGroups = ageGroupRows
            try? sync.store?.replaceTeams(teamRows)
            try? sync.store?.replaceSoccerDivisions(divisionRows)
            try? sync.store?.replaceSoccerCompetitions(competitionRows)
            try? sync.store?.replaceTeamAgeGroups(ageGroupRows)
        } catch {
            // Cached options are enough for offline capture.
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        error = nil
        let details = registrationDetails()

        do {
            let op: PendingSyncOperation
            let saved: PlayerListingRow
            if let row {
                op = try sync.enqueue(
                    kind: .soccerRegistration,
                    title: "Register \(row.name)",
                    payload: RegistrationMutationPayload(memberId: row.memberId, details: details)
                )
                saved = updatedExisting(row, details: details)
            } else {
                let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
                let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !first.isEmpty, !last.isEmpty else {
                    error = "Player first and last name are required."
                    return
                }
                let guardianStarted = [
                    guardianFirstName,
                    guardianLastName,
                    guardianEmail,
                    guardianPhone,
                    guardianRelationship,
                ].contains { cleaned($0) != nil }
                if guardianStarted
                    && (cleaned(guardianFirstName) == nil || cleaned(guardianLastName) == nil) {
                    error = "Guardian first and last name are required."
                    return
                }
                let emergencyStarted = [
                    emergencyName,
                    emergencyRelationship,
                    emergencyPhone,
                    emergencyEmail,
                ].contains { cleaned($0) != nil }
                if emergencyStarted
                    && (cleaned(emergencyName) == nil || cleaned(emergencyPhone) == nil) {
                    error = "Emergency contact name and phone are required."
                    return
                }
                let payload = FieldRegistrationPayload(
                    firstName: first,
                    lastName: last,
                    email: cleaned(email),
                    phone: cleaned(phone),
                    dateOfBirth: cleaned(dateOfBirth),
                    notes: cleaned(notes),
                    guardianFirstName: cleaned(guardianFirstName),
                    guardianLastName: cleaned(guardianLastName),
                    guardianEmail: cleaned(guardianEmail),
                    guardianPhone: cleaned(guardianPhone),
                    guardianRelationship: cleaned(guardianRelationship),
                    emergencyName: cleaned(emergencyName),
                    emergencyRelationship: cleaned(emergencyRelationship),
                    emergencyPhone: cleaned(emergencyPhone),
                    emergencyEmail: cleaned(emergencyEmail),
                    registration: details
                )
                op = try sync.enqueue(
                    kind: .soccerFieldRegistration,
                    title: "Register \(first) \(last)",
                    payload: payload
                )
                saved = newLocalRow(id: "local:\(op.clientId)", firstName: first, lastName: last, details: details)
                updateCachedMember(id: saved.memberId, firstName: first, lastName: last)
            }
            updateCachedListing(saved)
            await sync.coordinator?.syncIfOnline()
            onSaved(saved, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue registration.")
        }
    }

    private func registrationDetails() -> RegistrationDetailsPayload {
        RegistrationDetailsPayload(
            competitionId: cleaned(competitionId),
            ageGroupKey: cleaned(ageGroupKey),
            teamId: cleaned(teamId),
            divisionId: cleaned(divisionId),
            clearTeam: teamId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            clearDivision: divisionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            ffaNumber: cleaned(ffaNumber),
            gender: cleaned(gender),
            schoolName: cleaned(schoolName),
            registered: registered,
            paid: paid,
            paymentPlan: paymentPlan,
            paymentPlanStart: cleaned(paymentPlanStart),
            paymentPlanEnd: cleaned(paymentPlanEnd),
            comments: cleaned(comments),
            kitColour: cleaned(kitColour)
        )
    }

    private func updatedExisting(_ row: PlayerListingRow, details: RegistrationDetailsPayload) -> PlayerListingRow {
        makeRow(
            memberId: row.memberId,
            name: row.name,
            email: row.email,
            dateOfBirth: row.dateOfBirth,
            details: details,
            grade: row.grade
        )
    }

    private func newLocalRow(
        id: String,
        firstName: String,
        lastName: String,
        details: RegistrationDetailsPayload
    ) -> PlayerListingRow {
        makeRow(
            memberId: id,
            name: "\(firstName) \(lastName)",
            email: cleaned(email),
            dateOfBirth: cleaned(dateOfBirth),
            details: details,
            grade: nil
        )
    }

    private func makeRow(
        memberId: String,
        name: String,
        email: String?,
        dateOfBirth: String?,
        details: RegistrationDetailsPayload,
        grade: Double?
    ) -> PlayerListingRow {
        let selectedTeam = teams.first { $0.id == details.teamId }
        let selectedDivision = divisions.first { $0.id == details.divisionId }
        return PlayerListingRow(
            memberId: memberId,
            name: name,
            email: email,
            dateOfBirth: dateOfBirth,
            hasRegistration: true,
            registered: details.registered,
            registeredAt: nil,
            paid: details.paid,
            paidAt: nil,
            paymentPlan: details.paymentPlan,
            paymentPlanStart: details.paymentPlanStart,
            paymentPlanEnd: details.paymentPlanEnd,
            ffaNumber: details.ffaNumber,
            gender: details.gender,
            schoolName: details.schoolName,
            comments: details.comments,
            competitionId: details.competitionId,
            ageGroupKey: details.ageGroupKey,
            teamId: details.teamId,
            teamName: selectedTeam?.name,
            divisionId: details.divisionId,
            divisionName: selectedDivision?.name,
            divisionColor: selectedDivision?.color,
            kitColour: details.kitColour ?? selectedTeam?.kitColour,
            grade: grade
        )
    }

    private func updateCachedListing(_ row: PlayerListingRow) {
        var rows = (try? sync.store?.cachedPlayerListings()) ?? []
        if let index = rows.firstIndex(where: { $0.memberId == row.memberId }) {
            rows[index] = row
        } else {
            rows.append(row)
        }
        rows.sort { $0.name < $1.name }
        try? sync.store?.replacePlayerListings(rows)
    }

    private func updateCachedMember(id: String, firstName: String, lastName: String) {
        var members = (try? sync.store?.cachedMembers()) ?? []
        let member = Member(
            id: id,
            firstName: firstName,
            lastName: lastName,
            email: cleaned(email),
            phone: cleaned(phone),
            dateOfBirth: cleaned(dateOfBirth),
            status: .active,
            notes: cleaned(notes),
            isVolunteer: false,
            clubRole: "player"
        )
        members.append(member)
        members.sort { $0.fullName < $1.fullName }
        try? sync.store?.replaceMembers(members)
    }

    private func cleaned(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

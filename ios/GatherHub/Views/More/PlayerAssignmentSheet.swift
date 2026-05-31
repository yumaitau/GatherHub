import SwiftUI

/// Quick assignment sheet — slide-up from the player registrations
/// list. Lets the user set team, division, and kit colour without
/// leaving the row. Mirrors the web RegistrationDialog's three
/// assignment fields but skips the rest of the registration form,
/// since the typical mobile use case is "fix one of these on the
/// sideline".
///
/// Division picker has an "Auto (from grade)" sentinel: choosing it
/// sends `clearDivision: true` so the backend's grade-band fallback
/// matches the player into whichever division their score lands in.
struct PlayerAssignmentSheet: View {
    let row: PlayerListingRow
    let onSaved: (_ updated: PlayerListingRow, _ shouldReload: Bool) -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var teams: [Team] = []
    @State private var divisions: [SoccerDivision] = []
    @State private var loading = true
    @State private var error: String?

    @State private var teamId: String = ""
    /// "" means "Auto (from grade)" — sentinel for clearDivision = true.
    @State private var divisionId: String = ""
    @State private var kitColour: String = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Loading options…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error {
                    OfflineStateView(
                        title: "Couldn't load",
                        message: error,
                        retry: load
                    )
                } else {
                    form
                }
            }
            .background(Color.gh.paper.ignoresSafeArea())
            .navigationTitle("Assign · \(row.name)")
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
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var form: some View {
        Form {
            Section {
                Picker("Team", selection: $teamId) {
                    Text("Unassigned").tag("")
                    ForEach(teams) { t in
                        Text(t.name).tag(t.id)
                    }
                }
            } footer: {
                Text("Inheriting kit colour from this team when no override is set.")
                    .font(.gh.caption)
            }

            Section {
                Picker("Division", selection: $divisionId) {
                    Text("Auto (from grade)").tag("")
                    ForEach(divisions) { d in
                        Text(d.name).tag(d.id)
                    }
                }
            } footer: {
                let currentGrade = row.grade
                    .map { $0.formatted(.number.precision(.fractionLength(1))) } ?? "—"
                Text("Auto matches by grade. Current grade \(currentGrade).")
                    .font(.gh.caption)
            }

            Section {
                TextField("Hex like #bf0000 or label like Home", text: $kitColour)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Kit colour override")
            } footer: {
                Text("Leave blank to inherit from the player's team.")
                    .font(.gh.caption)
            }
        }
    }

    private func load() async {
        if let cachedTeams = try? sync.store?.cachedTeams(), !cachedTeams.isEmpty {
            teams = cachedTeams.filter { $0.isActive }
        }
        if let cachedDivisions = try? sync.store?.cachedSoccerDivisions(), !cachedDivisions.isEmpty {
            divisions = cachedDivisions.filter { $0.active }
        }
        teamId = row.teamId ?? ""
        divisionId = row.divisionId ?? ""
        kitColour = row.kitColour ?? ""
        loading = teams.isEmpty || divisions.isEmpty
        error = nil
        defer { loading = false }
        do {
            async let teamsTask = convex.listTeams(includeInactive: false)
            async let divisionsTask = convex.listSoccerDivisions()
            let (t, d) = try await (teamsTask, divisionsTask)
            teams = t
            divisions = d.filter { $0.active }
            try? sync.store?.replaceTeams(t)
            try? sync.store?.replaceSoccerDivisions(d)
            teamId = row.teamId ?? ""
            divisionId = row.divisionId ?? ""
            kitColour = row.kitColour ?? ""
        } catch let err {
            if teams.isEmpty || divisions.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load assignment options.")
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let payload = AssignmentPayload(
            memberId: row.memberId,
            teamId: teamId.isEmpty ? nil : teamId,
            divisionId: divisionId.isEmpty ? nil : divisionId,
            clearTeam: teamId.isEmpty,
            clearDivision: divisionId.isEmpty,
            kitColour: kitColour.trimmingCharacters(in: .whitespaces).isEmpty
                ? nil
                : kitColour
        )
        // Queue first so the write survives offline. The coordinator
        // attempts a drain right away — if we're online it lands now,
        // otherwise it sticks in the queue.
        do {
            let op = try sync.enqueue(
                kind: .soccerAssignment,
                title: "Assign \(row.name)",
                payload: payload
            )
            let updated = updatedListing()
            updateCachedListing(updated)
            await sync.coordinator?.syncIfOnline()
            onSaved(updated, op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue assignment.")
        }
    }

    private func updatedListing() -> PlayerListingRow {
        let selectedTeam = teams.first { $0.id == teamId }
        let selectedDivision = divisions.first { $0.id == divisionId }
        return PlayerListingRow(
            memberId: row.memberId,
            name: row.name,
            email: row.email,
            hasRegistration: true,
            registered: row.registered,
            paid: row.paid,
            paymentPlan: row.paymentPlan,
            ffaNumber: row.ffaNumber,
            teamId: teamId.isEmpty ? nil : teamId,
            teamName: selectedTeam?.name,
            divisionId: divisionId.isEmpty ? nil : divisionId,
            divisionName: selectedDivision?.name,
            divisionColor: selectedDivision?.color,
            kitColour: kitColour.trimmingCharacters(in: .whitespaces).isEmpty ? nil : kitColour,
            grade: row.grade
        )
    }

    private func updateCachedListing(_ updated: PlayerListingRow) {
        guard var rows = try? sync.store?.cachedPlayerListings(),
              let index = rows.firstIndex(where: { $0.memberId == row.memberId }) else {
            return
        }
        rows[index] = updated
        try? sync.store?.replacePlayerListings(rows)
    }
}

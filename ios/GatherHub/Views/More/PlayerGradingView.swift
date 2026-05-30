import SwiftUI

/// Score one player against the active rubric. Mirrors the web
/// `PlayerEvaluationPage` flow but in a phone-tappable form:
///   - Header shows the running grade + matched division.
///   - One card per active skill with a stepper (0..max in 0.5
///     increments) and an optional notes line.
///   - Each change calls `soccer:upsertEvaluation`; the grade reloads
///     after every save.
struct PlayerGradingView: View {
    let memberId: String
    let memberName: String

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment

    @State private var skills: [SoccerSkill] = []
    @State private var grade: PlayerGrade?
    @State private var scores: [String: Double] = [:]
    @State private var loading = true
    @State private var error: String?
    @State private var savingSkillId: String?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading rubric…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                OfflineStateView(
                    title: "Couldn't load rubric",
                    message: error,
                    retry: load
                )
            } else if skills.isEmpty {
                EmptyStateView(
                    title: "No skills configured",
                    systemImage: "gauge.with.dots.needle.67percent",
                    message: "Set up the skill rubric in Settings → Soccer on the web admin first. Once skills exist, score them here."
                )
            } else {
                ScrollView {
                    VStack(spacing: GHSpacing.xl) {
                        header
                        instructions
                        ForEach(skills) { skill in
                            skillCard(skill)
                        }
                    }
                    .padding(GHSpacing.pageInset)
                }
            }
        }
        .background(Color.gh.paper.ignoresSafeArea())
        .navigationTitle("Grade · \(memberName)")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private var header: some View {
        GHCard {
            VStack(alignment: .leading, spacing: GHSpacing.sm) {
                Text("Overall grade").ghLabelStyle()
                HStack(alignment: .firstTextBaseline, spacing: GHSpacing.md) {
                    Text(grade.map { String(format: "%.1f", $0.grade) } ?? "—")
                        .font(.gh.display)
                        .foregroundStyle(Color.gh.inkStrong)
                        .monospacedDigit()
                    if let division = grade?.division {
                        GHBadge(text: division.name, variant: .accent)
                    } else if grade?.scoredCount == 0 {
                        Text("Unscored")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    } else {
                        Text("Unassigned")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    }
                    Spacer()
                    if let g = grade {
                        Text("\(g.scoredCount) / \(g.totalSkills) skills")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkQuiet)
                    }
                }
            }
        }
    }

    private var instructions: some View {
        HStack(spacing: GHSpacing.md) {
            Image(systemName: "hand.tap")
                .foregroundStyle(Color.gh.accent)
            Text("Drag a slider or use ± to set a score. Each change saves automatically.")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkSoft)
            Spacer()
        }
        .padding(GHSpacing.md)
        .background(Color.gh.accentWash)
        .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius, style: .continuous))
    }

    private func skillCard(_ skill: SoccerSkill) -> some View {
        let score = scores[skill.id] ?? 0
        return GHCard(padding: GHSpacing.lg) {
            VStack(alignment: .leading, spacing: GHSpacing.md) {
                HStack {
                    Text(skill.name)
                        .font(.gh.bodyStrong)
                        .foregroundStyle(Color.gh.inkStrong)
                    Spacer()
                    if savingSkillId == skill.id {
                        ProgressView().scaleEffect(0.8)
                    }
                }
                if let desc = skill.description, !desc.isEmpty {
                    Text(desc)
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkSoft)
                }
                HStack {
                    Text("Weight \(String(format: "%.2f", skill.weight))")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                    Text("·").foregroundStyle(Color.gh.inkQuiet)
                    Text("Max \(formatted(skill.maxScore))")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
                HStack {
                    Text(formatted(score))
                        .font(.gh.headline)
                        .foregroundStyle(Color.gh.inkStrong)
                        .monospacedDigit()
                        .frame(width: 56, alignment: .leading)
                    Slider(
                        value: Binding(
                            get: { scores[skill.id] ?? 0 },
                            set: { scores[skill.id] = $0 }
                        ),
                        in: 0...skill.maxScore,
                        step: 0.5,
                        onEditingChanged: { editing in
                            if !editing {
                                Task { await save(skill) }
                            }
                        }
                    )
                    Stepper(
                        "",
                        value: Binding(
                            get: { scores[skill.id] ?? 0 },
                            set: { newValue in
                                scores[skill.id] = newValue
                                Task { await save(skill) }
                            }
                        ),
                        in: 0...skill.maxScore,
                        step: 0.5
                    )
                    .labelsHidden()
                }
            }
        }
    }

    private func formatted(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", value)
            : String(format: "%.1f", value)
    }

    private func load() async {
        loading = skills.isEmpty
        error = nil
        defer { loading = false }
        do {
            async let skillsTask = convex.listSoccerSkills(includeInactive: false)
            async let gradeTask = convex.playerGrade(memberId: memberId)
            let (s, g) = try await (skillsTask, gradeTask)
            skills = s
            grade = g
            var map: [String: Double] = [:]
            for ev in g.evaluations { map[ev.skillId] = ev.score }
            scores = map
        } catch let err {
            error = err.localizedDescription
        }
    }

    private func save(_ skill: SoccerSkill) async {
        guard let value = scores[skill.id] else { return }
        savingSkillId = skill.id
        defer { savingSkillId = nil }
        // Queue the write. Coordinator drains immediately if we're
        // online; otherwise the score sits in the queue.
        let payload = EvaluationPayload(
            memberId: memberId,
            skillId: skill.id,
            score: value,
            notes: nil
        )
        if let store = sync.store,
           let data = try? JSONEncoder().encode(payload) {
            try? store.enqueue(
                kind: .soccerEvaluation,
                title: "Score \(skill.name)",
                payload: data
            )
            await sync.coordinator?.syncIfOnline()
        }
        // Best-effort grade refresh — if we're offline the value will
        // come from the next online drain + reload cycle.
        if sync.monitor.isOnline {
            grade = try? await convex.playerGrade(memberId: memberId)
        }
    }
}

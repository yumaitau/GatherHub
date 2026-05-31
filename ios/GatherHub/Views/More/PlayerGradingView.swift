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
                    Text(grade.map { formattedGrade($0.grade) } ?? "—")
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
                    Text("Weight \(skill.weight.formatted(.number.precision(.fractionLength(2))))")
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
                        value: scoreBinding(for: skill),
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
                        value: scoreBinding(for: skill, savesImmediately: true),
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
            ? value.formatted(.number.precision(.fractionLength(0)))
            : value.formatted(.number.precision(.fractionLength(1)))
    }

    private func formattedGrade(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(1)))
    }

    private func scoreBinding(
        for skill: SoccerSkill,
        savesImmediately: Bool = false
    ) -> Binding<Double> {
        Binding(
            get: { scores[skill.id] ?? 0 },
            set: { newValue in
                scores[skill.id] = newValue
                if savesImmediately {
                    Task { await save(skill) }
                }
            }
        )
    }

    private func load() async {
        let hasCachedSoccerSkills = (try? sync.store?.hasCachedSoccerSkills()) ?? false
        if hasCachedSoccerSkills {
            skills = (try? sync.store?.cachedSoccerSkills()) ?? []
        }
        if let cachedGrade = try? sync.store?.cachedPlayerGrade(memberId: memberId) {
            grade = cachedGrade
            scores = scoreMap(from: cachedGrade.evaluations)
        }
        loading = !hasCachedSoccerSkills || grade == nil
        error = nil
        defer { loading = false }
        do {
            async let skillsTask = convex.listSoccerSkills(includeInactive: false)
            async let gradeTask = convex.playerGrade(memberId: memberId)
            let (s, g) = try await (skillsTask, gradeTask)
            skills = s
            grade = g
            try? sync.store?.replaceSoccerSkills(s)
            try? sync.store?.replacePlayerGrade(g, memberId: memberId)
            var map: [String: Double] = [:]
            for ev in g.evaluations { map[ev.skillId] = ev.score }
            scores = map
        } catch let err {
            if !hasCachedSoccerSkills || grade == nil {
                error = UserFacingError.message(err, fallback: "Couldn't load this player's grading.")
            }
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
        do {
            let op = try sync.enqueue(
                kind: .soccerEvaluation,
                title: "Score \(skill.name)",
                payload: payload
            )
            applyOptimisticScore(skill: skill, score: value)
            await sync.coordinator?.syncIfOnline()
            // Best-effort grade refresh only after this queued write
            // actually landed. If it is still failed/pending, keep the
            // optimistic cached grade visible until a later drain.
            if op.status == .applied {
                if let fresh = try? await convex.playerGrade(memberId: memberId) {
                    grade = fresh
                    try? sync.store?.replacePlayerGrade(fresh, memberId: memberId)
                }
            }
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue score.")
        }
    }

    private func applyOptimisticScore(skill: SoccerSkill, score: Double) {
        var evaluations = grade?.evaluations ?? []
        if let index = evaluations.firstIndex(where: { $0.skillId == skill.id }) {
            let existing = evaluations[index]
            evaluations[index] = SoccerEvaluation(
                id: existing.id,
                memberId: memberId,
                skillId: skill.id,
                score: score,
                notes: existing.notes,
                evaluatedAt: Date.now.timeIntervalSince1970 * 1000
            )
        } else {
            evaluations.append(
                SoccerEvaluation(
                    id: "local-\(memberId)-\(skill.id)",
                    memberId: memberId,
                    skillId: skill.id,
                    score: score,
                    notes: nil,
                    evaluatedAt: Date.now.timeIntervalSince1970 * 1000
                )
            )
        }
        let activeSkills = skills.filter { $0.active }
        let evalMap = scoreMap(from: evaluations)
        var weighted = 0.0
        var totalWeight = 0.0
        for skill in activeSkills {
            guard let score = evalMap[skill.id] else { continue }
            weighted += (score / skill.maxScore) * skill.weight
            totalWeight += skill.weight
        }
        let computed = totalWeight == 0 ? 0 : (weighted / totalWeight) * 100
        let updated = PlayerGrade(
            grade: computed,
            division: grade?.division,
            scoredCount: evaluations.count,
            totalSkills: activeSkills.count,
            evaluations: evaluations
        )
        grade = updated
        try? sync.store?.replacePlayerGrade(updated, memberId: memberId)
    }

    private func scoreMap(from evaluations: [SoccerEvaluation]) -> [String: Double] {
        var map: [String: Double] = [:]
        for evaluation in evaluations {
            map[evaluation.skillId] = evaluation.score
        }
        return map
    }
}

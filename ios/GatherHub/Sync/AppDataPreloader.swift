import Foundation

/// Online-only cache warmer for the signed-in user's active organisation.
///
/// Screen view-models still do read-through caching on demand, but this runs
/// immediately after auth/context sync so first-time offline navigation has
/// the same data those screens would otherwise fetch lazily.
@MainActor
final class AppDataPreloader {
    enum Status: Equatable {
        case idle
        case running(startedAt: Date)
        case finished(Result)

        var isRunning: Bool {
            if case .running = self { return true }
            return false
        }

        var lastSummary: String? {
            guard case .finished(let result) = self else { return nil }
            return result.summary
        }
    }

    struct Result: Equatable {
        let completedAt: Date
        let loadedSections: [String]
        let failures: [Failure]

        var summary: String {
            if failures.isEmpty {
                return "Data is up to date."
            }
            return "Data refresh completed with \(failures.count) issue\(failures.count == 1 ? "" : "s")."
        }
    }

    struct Failure: Equatable {
        let label: String
        let message: String
    }

    private struct StepValue<Value> {
        let label: String
        let value: Value?
        let failure: Failure?
    }

    private struct PartialPreloadFailure: LocalizedError {
        let count: Int
        let noun: String

        var errorDescription: String? {
            "\(count) \(noun)\(count == 1 ? "" : "s") could not be refreshed."
        }
    }

    func preload(
        context: CurrentContext,
        convex: ConvexService,
        store: LocalStore,
        shouldContinue: @escaping () -> Bool
    ) async -> Result {
        var loaded: [String] = []
        var failures: [Failure] = []

        record(
            await run("Org memberships") {
                try guardActive(shouldContinue)
                let rows = try await convex.myMemberships()
                try guardActive(shouldContinue)
                try store.replaceOrgMemberships(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        record(
            await run("Location defaults") {
                try guardActive(shouldContinue)
                let defaults = try await convex.locationDefaults()
                try guardActive(shouldContinue)
                try store.replaceLocationDefaults(defaults)
            },
            loaded: &loaded,
            failures: &failures
        )

        record(
            await run("Dashboard") {
                try guardActive(shouldContinue)
                let stats = try await convex.dashboardStats()
                var soccer: SoccerDashboardStats?
                if context.org.moduleEnabled("soccer") &&
                    (context.hasCapability("soccer.manage") || context.hasCapability("soccer.grade")) {
                    soccer = try? await convex.soccerDashboardStats()
                }
                try guardActive(shouldContinue)
                try store.replaceDashboard(DashboardSnapshot(stats: stats, soccer: soccer))
            },
            loaded: &loaded,
            failures: &failures
        )

        if context.org.moduleEnabled("people") && context.hasCapability("members.read") {
            record(
                await run("Members") {
                    try guardActive(shouldContinue)
                    let rows = try await convex.listMembers()
                    try guardActive(shouldContinue)
                    try store.replaceMembers(rows)
                },
                loaded: &loaded,
                failures: &failures
            )
        }

        if context.org.moduleEnabled("teams") && context.hasCapability("teams.read") {
            record(
                await run("Teams") {
                    try guardActive(shouldContinue)
                    let rows = try await convex.listTeams(includeInactive: true)
                    try guardActive(shouldContinue)
                    try store.replaceTeams(rows)
                },
                loaded: &loaded,
                failures: &failures
            )
        }

        if context.org.moduleEnabled("events") && context.hasCapability("events.read") {
            record(
                await run("Events") {
                    try guardActive(shouldContinue)
                    let rows = try await convex.listEvents(upcomingOnly: false)
                    try guardActive(shouldContinue)
                    try store.replaceEvents(rows)
                },
                loaded: &loaded,
                failures: &failures
            )
        }

        record(
            await run("Event types") {
                try guardActive(shouldContinue)
                let rows = try await convex.listEventTypes()
                try guardActive(shouldContinue)
                try store.replaceEventTypes(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        if context.org.moduleEnabled("announcements") {
            record(
                await run("Announcements") {
                    try guardActive(shouldContinue)
                    let rows = try await convex.listAnnouncements()
                    try guardActive(shouldContinue)
                    try store.replaceAnnouncements(rows)
                },
                loaded: &loaded,
                failures: &failures
            )
        }

        if context.org.moduleEnabled("training") && context.hasCapability("training.manage") {
            record(
                await run("Training certifications") {
                    try guardActive(shouldContinue)
                    let rows = try await convex.listTrainingCertifications()
                    try guardActive(shouldContinue)
                    try store.replaceTrainingCertifications(rows)
                },
                loaded: &loaded,
                failures: &failures
            )
        }

        if context.org.moduleEnabled("tasks") && context.hasCapability("tasks.manage") {
            record(
                await run("Tasks") {
                    try guardActive(shouldContinue)
                    let rows = try await convex.listTasks()
                    try guardActive(shouldContinue)
                    try store.replaceTasks(rows)
                },
                loaded: &loaded,
                failures: &failures
            )
        }

        record(
            await run("Asset categories") {
                try guardActive(shouldContinue)
                let rows = try await convex.listAssetCategories()
                try guardActive(shouldContinue)
                try store.replaceAssetCategories(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        record(
            await run("Asset conditions") {
                try guardActive(shouldContinue)
                let rows = try await convex.listAssetConditions()
                try guardActive(shouldContinue)
                try store.replaceAssetConditions(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        record(
            await run("Team age groups") {
                try guardActive(shouldContinue)
                let rows = try await convex.listTeamAgeGroups(includeInactive: true)
                try guardActive(shouldContinue)
                try store.replaceTeamAgeGroups(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        if context.org.moduleEnabled("assets") && context.hasCapability("assets.read") {
            var assetDetailCandidates: [AssetSummary] = []
            let assets = await runValue("Assets") {
                try guardActive(shouldContinue)
                let rows = try await convex.listAssets()
                try guardActive(shouldContinue)
                try store.replaceAssets(rows)
                return rows
            }
            record(assets, loaded: &loaded, failures: &failures)
            if let rows = assets.value {
                assetDetailCandidates.append(contentsOf: rows)
            }

            let checkedOutAssets = await runValue("Checked-out assets") {
                try guardActive(shouldContinue)
                let rows = try await convex.checkedOutAssets()
                try guardActive(shouldContinue)
                try store.replaceCheckedOutAssets(rows)
                return rows
            }
            record(checkedOutAssets, loaded: &loaded, failures: &failures)
            if let rows = checkedOutAssets.value {
                assetDetailCandidates.append(contentsOf: rows)
            }

            if !assetDetailCandidates.isEmpty {
                record(
                    await run("Asset details") {
                        try await preloadAssetDetails(
                            from: assetDetailCandidates,
                            convex: convex,
                            store: store,
                            shouldContinue: shouldContinue
                        )
                    },
                    loaded: &loaded,
                    failures: &failures
                )
            }
        }

        if context.org.moduleEnabled("soccer") &&
            (context.hasCapability("soccer.manage") || context.hasCapability("soccer.grade")) {
            await preloadSoccerData(
                convex: convex,
                store: store,
                shouldContinue: shouldContinue,
                loaded: &loaded,
                failures: &failures
            )
        }

        return Result(completedAt: .now, loadedSections: loaded, failures: failures)
    }

    private func preloadSoccerData(
        convex: ConvexService,
        store: LocalStore,
        shouldContinue: @escaping () -> Bool,
        loaded: inout [String],
        failures: inout [Failure]
    ) async {
        record(
            await run("Soccer registrations") {
                try guardActive(shouldContinue)
                let rows = try await convex.listPlayerRegistrations()
                try guardActive(shouldContinue)
                try store.replacePlayerListings(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        record(
            await run("Soccer divisions") {
                try guardActive(shouldContinue)
                let rows = try await convex.listSoccerDivisions()
                try guardActive(shouldContinue)
                try store.replaceSoccerDivisions(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        record(
            await run("Soccer competitions") {
                try guardActive(shouldContinue)
                let rows = try await convex.listSoccerCompetitions()
                try guardActive(shouldContinue)
                try store.replaceSoccerCompetitions(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        record(
            await run("Coaches and managers") {
                try guardActive(shouldContinue)
                let rows = try await convex.listCoachesManagers()
                try guardActive(shouldContinue)
                try store.replaceCoachesManagers(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        record(
            await run("Soccer skills") {
                try guardActive(shouldContinue)
                let rows = try await convex.listSoccerSkills(includeInactive: true)
                try guardActive(shouldContinue)
                try store.replaceSoccerSkills(rows)
            },
            loaded: &loaded,
            failures: &failures
        )

        let roster = await runValue("Player roster") {
            try guardActive(shouldContinue)
            let rows = try await convex.listPlayerRoster()
            try guardActive(shouldContinue)
            try store.replacePlayerRoster(rows)
            return rows
        }
        record(roster, loaded: &loaded, failures: &failures)

        if let rows = roster.value, !rows.isEmpty {
            record(
                await run("Player grades") {
                    try await preloadPlayerGrades(
                        from: rows,
                        convex: convex,
                        store: store,
                        shouldContinue: shouldContinue
                    )
                },
                loaded: &loaded,
                failures: &failures
            )
        }
    }

    private func preloadAssetDetails(
        from assets: [AssetSummary],
        convex: ConvexService,
        store: LocalStore,
        shouldContinue: @escaping () -> Bool
    ) async throws {
        let tagIds = Array(
            Set(
                assets.flatMap { asset in
                    [asset.qrTagId, asset.nfcTagId]
                        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                }
            )
        )
        .sorted()

        var failed = 0
        var fetchedAssetIds = Set<String>()
        for tagId in tagIds {
            try guardActive(shouldContinue)
            do {
                let lookup = try await convex.lookupTag(tagId)
                try guardActive(shouldContinue)
                try store.replaceTagLookup(lookup, tagId: tagId)
                if let assetId = lookup.asset?.id, fetchedAssetIds.insert(assetId).inserted {
                    do {
                        let history = try await convex.assetHistory(assetId: assetId)
                        try guardActive(shouldContinue)
                        try store.replaceAssetHistory(history, assetId: assetId)
                    } catch is CancellationError {
                        throw CancellationError()
                    } catch {
                        failed += 1
                    }
                }
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                failed += 1
            }
        }

        if failed > 0 {
            throw PartialPreloadFailure(count: failed, noun: "asset detail")
        }
    }

    private func preloadPlayerGrades(
        from roster: [PlayerRosterRow],
        convex: ConvexService,
        store: LocalStore,
        shouldContinue: @escaping () -> Bool
    ) async throws {
        let memberIds = Array(Set(roster.map(\.memberId))).sorted()
        var failed = 0
        for memberId in memberIds {
            try guardActive(shouldContinue)
            do {
                let grade = try await convex.playerGrade(memberId: memberId)
                try guardActive(shouldContinue)
                try store.replacePlayerGrade(grade, memberId: memberId)
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                failed += 1
            }
        }

        if failed > 0 {
            throw PartialPreloadFailure(count: failed, noun: "player grade")
        }
    }

    private func run(
        _ label: String,
        operation: () async throws -> Void
    ) async -> StepValue<Void> {
        await runValue(label) {
            try await operation()
            return ()
        }
    }

    private func runValue<Value>(
        _ label: String,
        operation: () async throws -> Value
    ) async -> StepValue<Value> {
        do {
            return StepValue(label: label, value: try await operation(), failure: nil)
        } catch is CancellationError {
            return StepValue(label: label, value: nil, failure: nil)
        } catch {
            return StepValue(
                label: label,
                value: nil,
                failure: Failure(
                    label: label,
                    message: UserFacingError.message(
                        error,
                        fallback: "\(label) could not be refreshed."
                    )
                )
            )
        }
    }

    private func record<Value>(
        _ step: StepValue<Value>,
        loaded: inout [String],
        failures: inout [Failure]
    ) {
        if let failure = step.failure {
            failures.append(failure)
        } else if step.value != nil {
            loaded.append(step.label)
        }
    }

    private func guardActive(_ shouldContinue: () -> Bool) throws {
        if Task.isCancelled || !shouldContinue() {
            throw CancellationError()
        }
    }
}

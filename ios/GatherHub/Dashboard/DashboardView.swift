import SwiftUI

/// Default landing surface for the iOS app once signed in: time-of-day
/// greeting, attention banner, "At a glance" counters, optional sport
/// summary. Mirrors `web/src/pages/DashboardPage.tsx` for parity with the
/// admin web client.
struct DashboardView: View {
    let context: CurrentContext
    @State private var model: DashboardViewModel
    @EnvironmentObject private var sync: SyncEnvironment

    init(context: CurrentContext, convex: ConvexService) {
        self.context = context
        _model = State(initialValue: DashboardViewModel(convex: convex))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: GHSpacing.xxl) {
                header

                switch model.state {
                case .idle, .loading:
                    skeleton
                case .failed(let message):
                    GHCard {
                        VStack(alignment: .leading, spacing: GHSpacing.md) {
                            Text("Couldn't load")
                                .font(.gh.title)
                                .foregroundStyle(Color.gh.inkStrong)
                            Text(message)
                                .font(.gh.body)
                                .foregroundStyle(Color.gh.inkSoft)
                            Button("Try again") {
                                Task { await model.load(sync: sync) }
                            }
                            .buttonStyle(.gh(.outline))
                        }
                    }
                case .loaded:
                    if let stats = model.stats {
                        attention(stats: stats)
                        glance(stats: stats)
                        if let s = model.soccer {
                            sportSection(stats: s)
                        }
                    }
                }
            }
            .padding(GHSpacing.pageInset)
        }
        .background(Color.gh.paper.ignoresSafeArea())
        .navigationTitle("Dashboard")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load(sync: sync) }
        .refreshable { await model.load(sync: sync) }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: GHSpacing.xs) {
            Text(DashboardViewModel.greeting() + greetingTail)
                .font(.gh.display)
                .foregroundStyle(Color.gh.inkStrong)
            Text("Here's what's happening at \(context.org.name).")
                .font(.gh.body)
                .foregroundStyle(Color.gh.inkSoft)
        }
    }

    private var greetingTail: String {
        guard let first = context.user.firstName, !first.isEmpty else { return "" }
        return ", \(first)"
    }

    // MARK: Attention banner

    @ViewBuilder
    private func attention(stats: DashboardStats) -> some View {
        let items: [AttentionItem] = [
            .init(count: stats.overdueCount, singular: "Overdue item", plural: "Overdue items", system: "clock", tone: .warning),
            .init(count: stats.lostCount, singular: "Lost item", plural: "Lost items", system: "exclamationmark.triangle", tone: .danger),
            .init(count: stats.expiringCertCount, singular: "Cert expiring", plural: "Certs expiring", system: "shield", tone: .warning),
        ].filter { $0.count > 0 }

        if items.isEmpty {
            GHCard {
                HStack(alignment: .top, spacing: GHSpacing.lg) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(Color.gh.success)
                        .frame(width: 32, height: 32)
                        .background(Color.gh.successWash)
                        .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Everything in order.")
                            .font(.gh.bodyStrong)
                            .foregroundStyle(Color.gh.inkStrong)
                        Text("Overdue items, losses, and expiring certifications will surface here as they appear.")
                            .font(.gh.caption)
                            .foregroundStyle(Color.gh.inkSoft)
                    }
                }
            }
        } else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: GHSpacing.lg), GridItem(.flexible(), spacing: GHSpacing.lg)], spacing: GHSpacing.lg) {
                ForEach(items) { item in
                    AttentionCardView(item: item)
                }
            }
        }
    }

    // MARK: At a glance

    @ViewBuilder
    private func glance(stats: DashboardStats) -> some View {
        VStack(alignment: .leading, spacing: GHSpacing.lg) {
            Text("At a glance").ghLabelStyle()
            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                spacing: GHSpacing.lg
            ) {
                glanceCell("Members", value: stats.memberCount)
                glanceCell("Teams", value: stats.teamCount)
                glanceCell("Events upcoming", value: stats.upcomingEventCount)
                glanceCell("Volunteers", value: stats.volunteerCount)
                glanceCell("Items tracked", value: stats.assetCount)
                glanceCell("Checked out", value: stats.checkedOutCount)
                glanceCell("Sponsors", value: stats.sponsorCount)
                glanceCell("Sponsor value", value: stats.sponsorValue, formatter: currencyFormatter)
            }
        }
    }

    private func glanceCell(_ label: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
            Text("\(value)")
                .font(.gh.headline)
                .foregroundStyle(Color.gh.inkStrong)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func glanceCell(_ label: String, value: Double, formatter: NumberFormatter) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
            Text(formatter.string(from: NSNumber(value: value)) ?? "—")
                .font(.gh.headline)
                .foregroundStyle(Color.gh.inkStrong)
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var currencyFormatter: NumberFormatter {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.maximumFractionDigits = 0
        return f
    }

    // MARK: Sport summary

    @ViewBuilder
    private func sportSection(stats: SoccerDashboardStats) -> some View {
        VStack(alignment: .leading, spacing: GHSpacing.lg) {
            Text(context.org.sportLabel).ghLabelStyle()
            LazyVGrid(columns: [GridItem(.flexible(), spacing: GHSpacing.lg), GridItem(.flexible(), spacing: GHSpacing.lg)], spacing: GHSpacing.lg) {
                SoccerCardView(
                    system: "list.clipboard",
                    tone: .info,
                    label: "Registered",
                    value: "\(stats.registered) / \(stats.playerCount)",
                    subline: "\(pct(stats.registered, of: stats.playerCount))% of active members",
                    progress: pct(stats.registered, of: stats.playerCount)
                )
                SoccerCardView(
                    system: "creditcard",
                    tone: stats.unpaid > 0 ? .warning : .success,
                    label: "Paid in full",
                    value: "\(stats.paid) / \(stats.playerCount)",
                    subline: stats.onPaymentPlan > 0
                        ? "\(stats.onPaymentPlan) on payment plan"
                        : "\(pct(stats.paid, of: stats.playerCount))% paid",
                    progress: pct(stats.paid, of: stats.playerCount)
                )
                SoccerCardView(
                    system: "checkmark.shield",
                    tone: stats.outstandingWwvp > 0 ? .danger : .success,
                    label: "WWVP outstanding",
                    value: "\(stats.outstandingWwvp)",
                    subline: "\(stats.wwvpApproved) approved · \(stats.wwvpSighted) sighted",
                    progress: nil
                )
                SoccerCardView(
                    system: "person.2.crop.square.stack",
                    tone: .info,
                    label: "Coaches & managers",
                    value: "\(stats.coachCount + stats.managerCount)",
                    subline: "\(stats.coachCount) coach · \(stats.managerCount) manager",
                    progress: nil
                )
                SoccerCardView(
                    system: "gauge",
                    tone: .info,
                    label: "Players graded",
                    value: "\(stats.evaluatedFully) / \(stats.playerCount)",
                    subline: "\(stats.evaluatedAny) started · \(stats.activeSkillCount) skills",
                    progress: pct(stats.evaluatedFully, of: stats.playerCount)
                )
            }
        }
    }

    private func pct(_ part: Int, of whole: Int) -> Int {
        guard whole > 0 else { return 0 }
        return Int(round(Double(part) / Double(whole) * 100))
    }

    // MARK: Skeleton

    private var skeleton: some View {
        VStack(spacing: GHSpacing.lg) {
            GHCard {
                Rectangle()
                    .fill(Color.gh.surfaceSunk)
                    .frame(height: 56)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: GHSpacing.lg) {
                ForEach(0..<6, id: \.self) { _ in
                    GHCard(padding: GHSpacing.lg) {
                        VStack(alignment: .leading, spacing: GHSpacing.sm) {
                            Rectangle().fill(Color.gh.surfaceSunk).frame(width: 80, height: 10)
                            Rectangle().fill(Color.gh.surfaceSunk).frame(width: 48, height: 22)
                        }
                    }
                }
            }
        }
        .redacted(reason: .placeholder)
    }
}

// MARK: - Attention card

private struct AttentionItem: Identifiable, Hashable {
    enum Tone { case warning, danger, info }
    let id = UUID()
    let count: Int
    let singular: String
    let plural: String
    let system: String
    let tone: Tone
}

private struct AttentionCardView: View {
    let item: AttentionItem

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            HStack(spacing: GHSpacing.sm) {
                Image(systemName: item.system)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(ink)
                Text(item.count == 1 ? item.singular : item.plural)
                    .ghLabelStyle()
            }
            Text("\(item.count)")
                .font(.gh.display)
                .foregroundStyle(ink)
                .monospacedDigit()
        }
        .padding(GHSpacing.xl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(wash)
        .clipShape(RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous)
                .stroke(Color.gh.hairline, lineWidth: 1)
        )
    }

    private var ink: Color {
        switch item.tone {
        case .warning: return Color.gh.warning
        case .danger: return Color.gh.danger
        case .info: return Color.gh.info
        }
    }
    private var wash: Color {
        switch item.tone {
        case .warning: return Color.gh.warningWash
        case .danger: return Color.gh.dangerWash
        case .info: return Color.gh.infoWash
        }
    }
}

// MARK: - Soccer card

private struct SoccerCardView: View {
    enum Tone { case info, warning, danger, success }
    let system: String
    let tone: Tone
    let label: String
    let value: String
    let subline: String
    let progress: Int?

    var body: some View {
        GHCard(padding: GHSpacing.lg) {
            VStack(alignment: .leading, spacing: GHSpacing.sm) {
                HStack(spacing: GHSpacing.sm) {
                    Image(systemName: system)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(ink)
                    Text(label).ghLabelStyle()
                }
                Text(value)
                    .font(.gh.headline)
                    .foregroundStyle(ink)
                    .monospacedDigit()
                Text(subline)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
                if let progress {
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.gh.surfaceSunk)
                            Capsule()
                                .fill(ink)
                                .frame(width: proxy.size.width * CGFloat(min(max(progress, 0), 100)) / 100)
                        }
                    }
                    .frame(height: 4)
                }
            }
        }
    }

    private var ink: Color {
        switch tone {
        case .info: return Color.gh.accent
        case .warning: return Color.gh.warning
        case .danger: return Color.gh.danger
        case .success: return Color.gh.success
        }
    }
}

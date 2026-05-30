import SwiftUI

/// "More" tab — dense, grouped index of every surface that does not
/// warrant a dedicated tab. Sections appear conditionally based on the
/// active org's mode and the caller's role.
///
/// Most rows currently route to a placeholder so the menu can ship
/// alongside the field-ops surfaces (scan + events) and the placeholder
/// destinations get backfilled feature-by-feature.
struct MoreView: View {
    let context: CurrentContext

    var body: some View {
        NavigationStack {
            List {
                operationsSection
                if context.org.soccerMode == true {
                    soccerSection
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("More")
            .safeAreaInset(edge: .bottom) { adminFootnote }
        }
    }

    // MARK: Sections

    /// Items the field-ops user actually reaches for with the phone in
    /// hand. Everything else (volunteers, sponsors, news, public site,
    /// reference taxonomies, settings, invitations, audit log) lives on
    /// the web admin — adding it here would dilute the field surface.
    private var operationsSection: some View {
        Section("Operations") {
            row("Members", system: "person.2") { MembersListView() }
            row("Teams", system: "shield.lefthalf.filled") { TeamsListView() }
            row("Announcements", system: "megaphone") { AnnouncementsListView() }
        }
    }

    private var soccerSection: some View {
        Section("Soccer") {
            row("Player registrations", system: "list.clipboard") {
                SoccerRegistrationsView()
            }
            row("Coaches & managers", system: "person.crop.rectangle.stack") {
                CoachesManagersView()
            }
            row("Grading", system: "gauge.with.dots.needle.67percent") {
                GradingListView()
            }
        }
    }

    /// Honest footnote so admins know where to go for the surfaces that
    /// intentionally don't ship on iOS.
    private var adminFootnote: some View {
        VStack(spacing: GHSpacing.xs) {
            Text("Full admin lives on the web.").ghLabelStyle()
            Text("Volunteers, sponsors, news, settings, invitations and audit logs are configured at app.gatherhub.au.")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
                .multilineTextAlignment(.center)
                .padding(.horizontal, GHSpacing.pageInset)
        }
        .padding(.vertical, GHSpacing.lg)
        .frame(maxWidth: .infinity)
        .background(Color.gh.surfaceSunk.opacity(0.5))
    }

    // MARK: Row helper

    @ViewBuilder
    private func row<Destination: View>(
        _ title: String,
        system: String,
        @ViewBuilder destination: () -> Destination
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            Label(title, systemImage: system)
        }
    }
}

/// Placeholder destination for "More" rows whose feature has not landed
/// in the iOS app yet. Keeps the menu navigable so we can spec the
/// remaining surfaces incrementally.
struct MorePlaceholderView: View {
    let title: String
    let description: String

    var body: some View {
        VStack(spacing: GHSpacing.xl) {
            Image(systemName: "tray.full")
                .font(.system(size: 32, weight: .regular))
                .foregroundStyle(Color.gh.inkQuiet)
            Text(title)
                .font(.gh.headline)
                .foregroundStyle(Color.gh.inkStrong)
            Text(description)
                .font(.gh.body)
                .foregroundStyle(Color.gh.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
            Text("Coming to iOS soon — use the web admin for now.")
                .font(.gh.caption)
                .foregroundStyle(Color.gh.inkQuiet)
        }
        .padding(GHSpacing.huge)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.gh.paper.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}


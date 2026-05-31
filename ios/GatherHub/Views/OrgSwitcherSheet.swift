import SwiftUI

/// Lists every club the signed-in user belongs to and lets them flip
/// the active one. Mirrors the web app's `OrgSwitcher` dropdown.
/// Presented as a sheet from Profile (and surfaced inline by RootView
/// when the user has multiple memberships but no active org yet).
struct OrgSwitcherSheet: View {
    let activeOrgId: String
    let onSwitched: () -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var memberships: [OrgMembership] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var switching: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading clubs…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error {
                    OfflineStateView(
                        title: "Couldn't load clubs",
                        message: error,
                        retry: { await load() }
                    )
                } else if memberships.isEmpty {
                    EmptyStateView(
                        title: "No clubs",
                        systemImage: "building.2",
                        message: "You aren't a member of any club. Ask a committee member for an invite."
                    )
                } else {
                    List(memberships) { m in
                        Button {
                            Task { await switchTo(m) }
                        } label: {
                            row(for: m)
                        }
                        .disabled(switching != nil)
                    }
                }
            }
            .navigationTitle("Switch club")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    @ViewBuilder
    private func row(for m: OrgMembership) -> some View {
        HStack(spacing: GHSpacing.lg) {
            Image(systemName: "building.2")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(Color.gh.accent)
                .frame(width: 40, height: 40)
                .background(Color.gh.accentWash)
                .clipShape(RoundedRectangle(cornerRadius: GHSpacing.chipRadius))
            VStack(alignment: .leading, spacing: 2) {
                Text(m.org?.name ?? "Unknown club")
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Text(m.role.displayName)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkSoft)
            }
            Spacer()
            if switching == m.org?.id {
                ProgressView()
            } else if m.org?.id == activeOrgId {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Color.gh.success)
            }
        }
        .padding(.vertical, GHSpacing.xs)
    }

    private func load() async {
        let hasCachedOrgMemberships = (try? sync.store?.hasCachedOrgMemberships()) ?? false
        if hasCachedOrgMemberships {
            memberships = (try? sync.store?.cachedOrgMemberships()) ?? []
        }
        isLoading = !hasCachedOrgMemberships
        error = nil
        defer { isLoading = false }
        do {
            let fresh = try await convex.myMemberships()
            memberships = fresh
            try? sync.store?.replaceOrgMemberships(fresh)
        } catch let err {
            if !hasCachedOrgMemberships && memberships.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load your clubs.")
            }
        }
    }

    private func switchTo(_ m: OrgMembership) async {
        guard let orgId = m.org?.id, orgId != activeOrgId else {
            dismiss()
            return
        }
        switching = orgId
        defer { switching = nil }
        do {
            try await convex.setActiveOrg(orgId)
            onSwitched()
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't switch clubs.")
        }
    }
}

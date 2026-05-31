import SwiftUI

/// A searchable sheet for picking a club member (`members:list`), e.g. the
/// custodian to check an asset out to.
struct MemberPickerView: View {
    /// Called with the chosen member.
    let onSelect: (Member) -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var members: [Member] = []
    @State private var search = ""
    @State private var phase: Phase = .loading

    enum Phase: Equatable { case loading, loaded, failed(String) }

    private var filtered: [Member] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return members }
        return members.filter {
            "\($0.fullName) \($0.email ?? "")".lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .loading:
                    ProgressView("Loading members…")
                case .failed(let message):
                    OfflineStateView(
                        title: "Couldn't load members",
                        message: message,
                        retry: load
                    )
                case .loaded:
                    list
                }
            }
            .navigationTitle("Choose custodian")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    private var list: some View {
        List(filtered) { member in
            Button {
                onSelect(member)
            } label: {
                HStack {
                    VStack(alignment: .leading) {
                        Text(member.fullName).foregroundStyle(.primary)
                        if let email = member.email {
                            Text(email).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    if member.status == .inactive {
                        Text("Inactive").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .searchable(text: $search, prompt: "Search members")
        .overlay {
            if filtered.isEmpty {
                EmptyStateView(
                    title: search.isEmpty ? "No members" : "No matches",
                    systemImage: "person.2.slash",
                    message: search.isEmpty ? nil : "No members match \"\(search)\"."
                )
            }
        }
    }

    private func load() async {
        if let cached = try? sync.store?.cachedMembers(), !cached.isEmpty {
            members = cached
            phase = .loaded
        } else {
            phase = .loading
        }
        do {
            let fresh = try await convex.listMembers()
            members = fresh
            try? sync.store?.replaceMembers(fresh)
            phase = .loaded
        } catch {
            if members.isEmpty {
                phase = .failed(UserFacingError.message(error, fallback: "Couldn't load members."))
            } else {
                phase = .loaded
            }
        }
    }
}

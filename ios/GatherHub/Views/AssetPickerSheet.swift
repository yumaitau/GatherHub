import SwiftUI

/// Sheet shown after a scan of an unknown tag. Lists the current org's
/// assets and binds the scanned `tagId` to whichever asset the user
/// picks via `assets:registerNfc`. Mirrors Kit-Trace's "register jersey"
/// inline flow.
struct AssetPickerSheet: View {
    let tagId: String
    let onRegistered: (AssetSummary) -> Void

    @EnvironmentObject private var convex: ConvexService
    @Environment(\.dismiss) private var dismiss

    @State private var assets: [AssetSummary] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var error: String?
    @State private var registering = false

    private var filtered: [AssetSummary] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return assets }
        return assets.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading assets…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error {
                    OfflineStateView(
                        title: "Couldn't load assets",
                        message: error,
                        retry: { await load() }
                    )
                } else if assets.isEmpty {
                    EmptyStateView(
                        title: "No assets yet",
                        systemImage: "shippingbox",
                        message: "Create an asset in the web app first, then register this tag against it."
                    )
                } else {
                    List(filtered) { asset in
                        Button {
                            Task { await register(asset) }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(asset.name)
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(.primary)
                                if let category = asset.category {
                                    Text(category.capitalized)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .disabled(registering)
                    }
                    .searchable(text: $query, prompt: "Search assets")
                }
            }
            .navigationTitle("Register tag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            assets = try await convex.listAssets()
        } catch let err {
            error = err.localizedDescription
        }
    }

    private func register(_ asset: AssetSummary) async {
        registering = true
        defer { registering = false }
        do {
            try await convex.registerNfc(assetId: asset.id, nfcTagId: tagId)
            onRegistered(asset)
            dismiss()
        } catch let err {
            error = err.localizedDescription
        }
    }
}

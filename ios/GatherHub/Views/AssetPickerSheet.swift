import SwiftUI

/// Sheet shown after a scan of an unknown tag. Staff can create a new
/// KitTrace asset from a scanned NFC UID or bind that UID to an existing
/// asset. The backend mints the QR tag during `assets:create`, so the
/// web and iOS asset records stay in the same tag model.
struct AssetPickerSheet: View {
    let tagId: String
    let onRegistered: (_ shouldReload: Bool) -> Void

    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var assets: [AssetSummary] = []
    @State private var query = ""
    @State private var isLoading = true
    @State private var error: String?
    @State private var registering = false
    @State private var creating = false
    @State private var newAssetName = ""
    @State private var newAssetCategory = "equipment"
    @State private var newAssetSerial = ""
    @State private var newAssetLocation = ""
    @State private var defaultAddress: String?
    @State private var assetCategories: [TaxonomyOption] = []

    private var filtered: [AssetSummary] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return assets }
        return assets.filter { $0.name.lowercased().contains(q) }
    }

    private var canCreateFromScannedTag: Bool {
        !TagParser.isBareTagId(tagId)
    }

    private var isSubmitting: Bool {
        registering || creating
    }

    private var trimmedNewAssetName: String {
        newAssetName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var categoryOptions: [(key: String, label: String)] {
        if assetCategories.isEmpty {
            return defaultAssetCategories
        }
        return assetCategories.map { ($0.key, $0.label) }
    }

    var body: some View {
        NavigationStack {
            Form {
                if canCreateFromScannedTag {
                    createAssetSection
                }

                Section {
                    if isLoading {
                        HStack {
                            ProgressView()
                            Text("Loading assets...")
                                .foregroundStyle(.secondary)
                        }
                    } else if let error {
                        VStack(alignment: .leading, spacing: GHSpacing.sm) {
                            Text("Couldn't load assets")
                                .font(.gh.bodyStrong)
                            Text(error)
                                .font(.gh.caption)
                                .foregroundStyle(Color.gh.inkSoft)
                            Button("Retry") {
                                Task { await load() }
                            }
                            .buttonStyle(.gh(.outline, size: .sm))
                        }
                        .padding(.vertical, GHSpacing.xs)
                    } else if assets.isEmpty {
                        Text("No existing assets in this organisation.")
                            .font(.gh.body)
                            .foregroundStyle(Color.gh.inkSoft)
                    } else if filtered.isEmpty {
                        Text("No assets match your search.")
                            .font(.gh.body)
                            .foregroundStyle(Color.gh.inkSoft)
                    } else {
                        ForEach(filtered) { asset in
                            Button {
                                Task { await register(asset) }
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(asset.name)
                                            .font(.body.weight(.medium))
                                            .foregroundStyle(.primary)
                                        if let category = asset.category {
                                            Text(category.taxonomyDisplayName)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    Image(systemName: "tag")
                                        .foregroundStyle(Color.gh.inkQuiet)
                                }
                            }
                            .disabled(isSubmitting)
                        }
                    }
                } header: {
                    Text("Bind existing asset")
                } footer: {
                    Text("Use this when the physical NFC tag belongs to an asset that already exists in KitTrace.")
                }
            }
            .searchable(text: $query, prompt: "Search assets")
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

    private var createAssetSection: some View {
        Section {
            TextField("Asset name", text: $newAssetName)
                .textInputAutocapitalization(.words)

            Picker("Category", selection: $newAssetCategory) {
                ForEach(categoryOptions, id: \.key) { category in
                    Text(category.label).tag(category.key)
                }
            }

            TextField("Serial number", text: $newAssetSerial)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()

            AddressLookupField(
                title: "Location",
                text: $newAssetLocation,
                defaultAddress: defaultAddress
            )

            Button {
                Task { await createNewAsset() }
            } label: {
                if creating {
                    ProgressView()
                } else {
                    Label("Create asset for this NFC tag", systemImage: "plus.square")
                }
            }
            .disabled(isSubmitting || trimmedNewAssetName.isEmpty)
        } header: {
            Text("Create new asset")
        } footer: {
            Text("This creates the asset, mints its QR code, and registers the scanned NFC tag.")
        }
    }

    private func load() async {
        if let defaults = try? sync.store?.cachedLocationDefaults() {
            defaultAddress = defaults.defaultAddress
            if newAssetLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                newAssetLocation = defaults.defaultAddress ?? ""
            }
        }
        if let categories = try? sync.store?.cachedAssetCategories(), !categories.isEmpty {
            assetCategories = categories
            selectDefaultCategory(from: categories)
        }
        if let cachedAssets = try? sync.store?.cachedAssets(), !cachedAssets.isEmpty {
            assets = cachedAssets
        }
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let defaults = try? await convex.locationDefaults()
            defaultAddress = defaults?.defaultAddress
            if let defaults {
                try? sync.store?.replaceLocationDefaults(defaults)
            }
            if newAssetLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                newAssetLocation = defaultAddress ?? ""
            }
            if let categories = try? await convex.listAssetCategories(), !categories.isEmpty {
                assetCategories = categories
                try? sync.store?.replaceAssetCategories(categories)
                selectDefaultCategory(from: categories)
            }
            let freshAssets = try await convex.listAssets()
            assets = freshAssets
            try? sync.store?.replaceAssets(freshAssets)
        } catch let err {
            if assets.isEmpty {
                error = UserFacingError.message(err, fallback: "Couldn't load assets.")
            }
        }
    }

    private func createNewAsset() async {
        creating = true
        error = nil
        defer { creating = false }
        do {
            let serial = newAssetSerial.trimmingCharacters(in: .whitespacesAndNewlines)
            let location = newAssetLocation.trimmingCharacters(in: .whitespacesAndNewlines)
            let op = try sync.enqueue(
                kind: .assetCreate,
                title: "Create asset \(trimmedNewAssetName)",
                payload: CreateAssetPayload(
                    name: trimmedNewAssetName,
                    category: newAssetCategory,
                    serialNumber: serial.isEmpty ? nil : serial,
                    location: location.isEmpty ? nil : location,
                    nfcTagId: tagId
                )
            )
            await sync.coordinator?.syncIfOnline()
            onRegistered(op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue asset creation.")
        }
    }

    private func register(_ asset: AssetSummary) async {
        registering = true
        error = nil
        defer { registering = false }
        do {
            let op = try sync.enqueue(
                kind: .assetRegisterNfc,
                title: "Bind NFC tag to \(asset.name)",
                payload: RegisterNfcPayload(assetId: asset.id, nfcTagId: tagId)
            )
            cacheRegistered(asset)
            await sync.coordinator?.syncIfOnline()
            onRegistered(op.status == .applied)
            dismiss()
        } catch let err {
            error = UserFacingError.message(err, fallback: "Couldn't queue tag registration.")
        }
    }

    private func selectDefaultCategory(from categories: [TaxonomyOption]) {
        if !categories.contains(where: { $0.key == newAssetCategory }) {
            let selected = categories.first(where: { $0.isDefault }) ?? categories[0]
            newAssetCategory = selected.key
        }
    }

    private func cacheRegistered(_ asset: AssetSummary) {
        guard let idx = assets.firstIndex(where: { $0.id == asset.id }) else { return }
        let updated = AssetSummary(
            id: asset.id,
            name: asset.name,
            category: asset.category,
            status: asset.status,
            custodianName: asset.custodianName,
            location: asset.location,
            dueBack: asset.dueBack,
            qrTagId: asset.qrTagId,
            nfcTagId: tagId,
            serialNumber: asset.serialNumber
        )
        assets[idx] = updated
        try? sync.store?.replaceAssets(assets)
    }
}

private let defaultAssetCategories: [(key: String, label: String)] = [
    ("equipment", "Equipment"),
    ("apparel", "Apparel"),
    ("tool", "Tool"),
    ("electronics", "Electronics"),
    ("safety_equipment", "Safety equipment"),
    ("vehicle", "Vehicle"),
    ("key", "Key"),
    ("other", "Other"),
]

import SwiftUI

/// Inspector for queued write operations. Lets the user see what's
/// waiting, force a sync, or discard a stuck row. Nothing in the queue
/// is ever deleted automatically — failed and rejected items stay until
/// the user resolves them.
struct PendingQueueView: View {
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var operations: [PendingSyncOperation] = []
    @State private var refreshing = false

    var body: some View {
        Group {
            if operations.isEmpty {
                EmptyStateView(
                    title: "Nothing waiting to sync",
                    systemImage: "checkmark.circle",
                    message: "Every change you've made is already on the server."
                )
            } else {
                List {
                    Section {
                        HStack {
                            if let last = sync.coordinator?.lastSyncedAt {
                                Text("Last sync \(last, style: .relative) ago")
                                    .font(.gh.caption)
                                    .foregroundStyle(Color.gh.inkQuiet)
                            } else {
                                Text("Never synced this session")
                                    .font(.gh.caption)
                                    .foregroundStyle(Color.gh.inkQuiet)
                            }
                            Spacer()
                            Button {
                                Task { await sync.coordinator?.sync(); reload() }
                            } label: {
                                if sync.coordinator?.isSyncing == true {
                                    ProgressView().scaleEffect(0.7)
                                } else {
                                    Text("Sync now")
                                        .font(.gh.caption.weight(.semibold))
                                }
                            }
                            .disabled(
                                !sync.monitor.isOnline
                                    || sync.coordinator?.isSyncing == true
                            )
                        }
                    }
                    Section("Queue") {
                        ForEach(operations, id: \.id) { op in
                            row(for: op)
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        try? sync.store?.delete(op)
                                        reload()
                                    } label: {
                                        Label("Discard", systemImage: "trash")
                                    }
                                }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Sync queue")
        .navigationBarTitleDisplayMode(.inline)
        .task { reload() }
        .refreshable { reload() }
    }

    private func row(for op: PendingSyncOperation) -> some View {
        VStack(alignment: .leading, spacing: GHSpacing.xs) {
            HStack {
                Text(op.title)
                    .font(.gh.bodyStrong)
                    .foregroundStyle(Color.gh.inkStrong)
                Spacer()
                statusBadge(op.status)
            }
            HStack(spacing: GHSpacing.sm) {
                Text(op.kind.label)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
                if op.attemptCount > 0 {
                    Text("· \(op.attemptCount) attempt\(op.attemptCount == 1 ? "" : "s")")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                }
                Spacer()
                Text(op.createdAt, style: .relative)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkQuiet)
            }
            if let message = op.lastErrorMessage, !message.isEmpty {
                Text(message)
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.danger)
                    .lineLimit(3)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func statusBadge(_ status: SyncOperationStatus) -> some View {
        switch status {
        case .pending: GHBadge(text: status.label, variant: .muted)
        case .submitted: GHBadge(text: status.label, variant: .info)
        case .applied: GHBadge(text: status.label, variant: .success)
        case .rejected: GHBadge(text: status.label, variant: .danger)
        case .failed: GHBadge(text: status.label, variant: .warning)
        }
    }

    private func reload() {
        operations = (try? sync.store?.pendingOperations()) ?? []
        sync.coordinator?.refreshUnsettledCount()
    }
}

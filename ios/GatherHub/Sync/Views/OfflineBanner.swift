import SwiftUI

/// Persistent banner shown at the top of the tab shell when the network
/// monitor reports the device is offline, or when there are queued
/// writes waiting to drain. Tap to open the pending-queue inspector.
struct OfflineBanner: View {
    @EnvironmentObject private var sync: SyncEnvironment
    var onOpenQueue: () -> Void = {}

    var body: some View {
        let isOffline = !sync.monitor.isOnline
        let pending = sync.coordinator?.unsettledCount ?? 0
        let showingSomething = isOffline || pending > 0

        if showingSomething {
            HStack(spacing: GHSpacing.sm) {
                Image(systemName: isOffline ? "wifi.slash" : "arrow.triangle.2.circlepath")
                    .font(.gh.caption.weight(.semibold))
                    .foregroundStyle(isOffline ? Color.gh.warning : Color.gh.info)
                Text(label(isOffline: isOffline, pending: pending))
                    .font(.gh.caption)
                    .foregroundStyle(Color.gh.inkStrong)
                    .multilineTextAlignment(.leading)
                Spacer()
                if pending > 0 {
                    Button {
                        Task { await sync.coordinator?.sync() }
                    } label: {
                        Text(sync.coordinator?.isSyncing == true ? "Syncing…" : "Sync now")
                            .font(.gh.caption.weight(.semibold))
                    }
                    .disabled(isOffline || sync.coordinator?.isSyncing == true)
                }
                Image(systemName: "chevron.right")
                    .font(.gh.caption.weight(.semibold))
                    .foregroundStyle(Color.gh.inkQuiet)
            }
            .padding(.horizontal, GHSpacing.lg)
            .padding(.vertical, GHSpacing.sm)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .onTapGesture(perform: onOpenQueue)
            .background(isOffline ? Color.gh.warningWash : Color.gh.infoWash)
            .overlay(
                Rectangle()
                    .fill(Color.gh.hairline)
                    .frame(height: 1),
                alignment: .bottom
            )
        }
    }

    private func label(isOffline: Bool, pending: Int) -> String {
        if isOffline && pending > 0 {
            return "Offline · \(pending) change\(pending == 1 ? "" : "s") will sync when connected"
        }
        if isOffline { return "Offline — showing last-known data" }
        return "\(pending) change\(pending == 1 ? "" : "s") waiting to sync"
    }
}

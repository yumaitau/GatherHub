import SwiftUI

/// The signed-in app shell: Home, Assets (scan + lookup combined),
/// Events, More (expansive menu), Profile.
struct MainTabView: View {
    let context: CurrentContext
    var onSwitchOrg: () -> Void = {}
    @EnvironmentObject private var convex: ConvexService
    @EnvironmentObject private var sync: SyncEnvironment
    @State private var showingSyncQueue = false

    var body: some View {
        VStack(spacing: 0) {
            OfflineBanner {
                showingSyncQueue = true
            }

            TabView {
                NavigationStack {
                    DashboardView(context: context, convex: convex)
                }
                .tabItem { Label("Home", systemImage: "house") }

                if context.org.moduleEnabled("assets") && context.hasCapability("assets.read") {
                    AssetsView(context: context)
                        .tabItem {
                            Label(
                                context.org.term(\.assetPlural, fallback: "assets").capitalized,
                                systemImage: "qrcode.viewfinder"
                            )
                        }
                }

                if context.org.moduleEnabled("events") && context.hasCapability("events.read") {
                    EventCalendarView(context: context)
                        .tabItem {
                            Label(
                                context.org.term(\.eventPlural, fallback: "events").capitalized,
                                systemImage: "calendar"
                            )
                        }
                }

                MoreView(context: context)
                    .tabItem { Label("More", systemImage: "ellipsis.circle") }

                ProfileView(context: context, onSwitchOrg: onSwitchOrg)
                    .tabItem { Label("Profile", systemImage: "person.crop.circle") }
            }
            .tint(Color.gh.accent)
        }
        .sheet(isPresented: $showingSyncQueue) {
            NavigationStack {
                PendingQueueView()
            }
        }
        .onChange(of: sync.monitor.isOnline) { _, isOnline in
            if isOnline {
                Task {
                    await sync.coordinator?.syncIfOnline()
                    sync.startPreload(context: context, convex: convex, force: true)
                }
            }
        }
    }
}

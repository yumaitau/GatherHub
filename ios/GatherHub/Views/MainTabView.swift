import SwiftUI

/// The signed-in app shell: Scan, Assets, Events, Profile.
struct MainTabView: View {
    let context: CurrentContext

    var body: some View {
        TabView {
            ScanView()
                .tabItem { Label("Scan", systemImage: "qrcode.viewfinder") }

            AssetLookupView()
                .tabItem { Label("Assets", systemImage: "shippingbox") }

            EventListView(context: context)
                .tabItem { Label("Events", systemImage: "calendar") }

            ProfileView(context: context)
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
    }
}

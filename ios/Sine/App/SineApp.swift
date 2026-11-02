import SwiftUI

@main
struct SineApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Color.sineGreen)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, phase in
            guard model.auth.isSignedIn else { return }
            if phase == .active {
                model.player.startPolling()
            } else {
                model.player.stopPolling()
            }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.auth.isSignedIn {
                MainView()
            } else {
                ConnectView()
            }
        }
        .animation(.easeInOut, value: model.auth.isSignedIn)
    }
}

extension Color {
    static let sineGreen = Color(red: 0.118, green: 0.843, blue: 0.376)
}

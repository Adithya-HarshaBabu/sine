import SwiftUI

struct MainView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        @Bindable var player = model.player
        TabView {
            HomeView()
                .withMiniPlayer()
                .tabItem { Label("Home", systemImage: "house.fill") }
            SearchView()
                .withMiniPlayer()
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
            LibraryView()
                .withMiniPlayer()
                .tabItem { Label("Library", systemImage: "books.vertical.fill") }
        }
        .fullScreenCover(isPresented: $model.showNowPlaying) {
            NowPlayingView()
        }
        .sheet(isPresented: $player.needsDevice) {
            DevicePicker()
                .presentationDetents([.medium, .large])
        }
        .task {
            model.player.startPolling()
        }
        .task(id: model.player.track?.artworkURL) {
            await model.tint.update(for: model.player.track?.artworkURL)
        }
        .alert(
            "Something went wrong",
            isPresented: Binding(
                get: { model.error != nil || model.player.error != nil },
                set: { if !$0 { model.error = nil; model.player.error = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.error ?? model.player.error ?? "")
        }
    }
}

extension View {
    func withMiniPlayer() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) { MiniPlayer() }
    }
}

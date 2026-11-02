import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var recent: [Track] = []
    @State private var artists: [Artist] = []
    @State private var loaded = false
    @State private var searchArtist: Artist?

    private var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case ..<5: "Good night"
        case ..<12: "Good morning"
        case ..<18: "Good afternoon"
        default: "Good evening"
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HStack {
                        SineLogo(size: 30)
                        Text(greeting).font(.largeTitle.bold())
                    }
                    .padding(.top, 8)

                    if model.auth.missingScopes {
                        ReconnectCard()
                    } else if !loaded {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else {
                        if !recent.isEmpty {
                            section("Recently played") {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    LazyHStack(spacing: 14) {
                                        ForEach(Array(recent.enumerated()), id: \.element.id) { index, track in
                                            Button {
                                                Task { await model.player.play(recent, at: index) }
                                            } label: {
                                                VStack(alignment: .leading, spacing: 6) {
                                                    Artwork(url: track.artworkURL, corner: 8)
                                                        .frame(width: 150, height: 150)
                                                        .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                                                    Text(track.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                                                        .foregroundStyle(model.player.track?.uri == track.uri ? model.tint.vivid : .primary)
                                                    Text(track.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                                }
                                                .frame(width: 150)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                }
                                .padding(.horizontal, -20)
                            }
                        }
                        if !artists.isEmpty {
                            section("Your top artists lately") {
                                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 16)], spacing: 18) {
                                    ForEach(artists) { artist in
                                        Button {
                                            searchArtist = artist
                                        } label: {
                                            VStack(spacing: 8) {
                                                Artwork(url: artist.imageURL, corner: 60)
                                                    .aspectRatio(1, contentMode: .fit)
                                                    .clipShape(Circle())
                                                Text(artist.name).font(.subheadline.weight(.medium)).lineLimit(1)
                                            }
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                        if recent.isEmpty && artists.isEmpty {
                            Text("Play some music and your recent songs and favourite artists will show up here.")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .background(SineBackground())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Sign out", role: .destructive) { model.signOut() }
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                    .accessibilityLabel("Account")
                }
            }
            .navigationDestination(item: $searchArtist) { artist in
                SearchResultsView(query: artist.name)
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.title2.bold())
            content()
        }
    }

    private func load() async {
        guard !model.auth.missingScopes else { return }
        async let r = model.api.recentlyPlayed()
        async let a = model.api.topArtists()
        recent = (try? await r) ?? recent
        artists = (try? await a) ?? artists
        loaded = true
    }
}

struct ReconnectCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sine needs one more Spotify permission for your recently played, top artists and likes.")
            Button("Reconnect Spotify") {
                Task { await model.signIn() }
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
        }
        .padding()
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }
}

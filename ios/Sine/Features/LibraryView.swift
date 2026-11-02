import SwiftUI

struct LibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var playlists: [Playlist] = []

    var body: some View {
        NavigationStack {
            List {
                NavigationLink {
                    LikedSongsView()
                } label: {
                    HStack(spacing: 14) {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(LinearGradient(colors: [.indigo, .sineGreen], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 56, height: 56)
                            .overlay(Image(systemName: "heart.fill").foregroundStyle(.white))
                        Text("Liked songs").font(.headline)
                    }
                }
                .listRowBackground(Color.clear)

                Section("Playlists") {
                    ForEach(playlists) { playlist in
                        NavigationLink(value: playlist) {
                            HStack(spacing: 14) {
                                Artwork(url: playlist.artworkURL, corner: 6).frame(width: 56, height: 56)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(playlist.name).font(.body.weight(.medium)).lineLimit(1)
                                    Text(playlist.readable ? "\(playlist.count ?? 0) songs" : "Following")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .listRowBackground(Color.clear)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(SineBackground())
            .navigationTitle("Library")
            .navigationDestination(for: Playlist.self) { PlaylistView(playlist: $0) }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        do {
            playlists = try await model.api.playlists()
        } catch {
            model.error = error.localizedDescription
        }
    }
}

struct LikedSongsView: View {
    @Environment(AppModel.self) private var model
    @State private var tracks: [Track] = []
    @State private var total = 0
    @State private var loadingMore = false

    var body: some View {
        List {
            ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                TrackRow(track: track) {
                    Task { await model.player.play(tracks, at: index) }
                }
                .listRowBackground(Color.clear)
                .onAppear {
                    // Infinite scroll: fetch the next page as the end comes into view.
                    if index >= tracks.count - 10 { Task { await loadMore() } }
                }
            }
            if loadingMore {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(SineBackground())
        .navigationTitle("Liked songs")
        .toolbar {
            if total > 0 {
                ToolbarItem(placement: .principal) {
                    VStack {
                        Text("Liked songs").font(.headline)
                        Text("\(total) songs").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .task {
            guard tracks.isEmpty else { return }
            await loadMore()
        }
    }

    private func loadMore() async {
        guard !loadingMore, tracks.isEmpty || tracks.count < total else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page = try await model.api.savedTracks(offset: tracks.count)
            tracks += page.items
            total = page.total
            model.markSaved(page.items)
        } catch {
            model.error = error.localizedDescription
        }
    }
}

struct PlaylistView: View {
    @Environment(AppModel.self) private var model
    let playlist: Playlist
    @State private var tracks: [Track] = []
    @State private var total = 0
    @State private var loadingMore = false

    var body: some View {
        List {
            VStack(spacing: 14) {
                Artwork(url: playlist.artworkURL, corner: 10)
                    .frame(width: 200, height: 200)
                    .shadow(color: .black.opacity(0.4), radius: 16, y: 8)
                Text(playlist.name).font(.title2.bold()).multilineTextAlignment(.center)
                if let count = playlist.count {
                    Text("\(count) songs").font(.subheadline).foregroundStyle(.secondary)
                }
                Button {
                    Task { await model.player.playPlaylist(playlist) }
                } label: {
                    Label("Play", systemImage: "play.fill")
                        .font(.headline)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 12)
                        .background(Color.sineGreen, in: Capsule())
                        .foregroundStyle(.black)
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)

            if playlist.readable {
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    TrackRow(track: track) {
                        Task { await model.player.play(tracks, at: index, playlistID: playlist.id) }
                    }
                    .listRowBackground(Color.clear)
                    .onAppear {
                        if index >= tracks.count - 10 { Task { await loadMore() } }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Spotify doesn't share this playlist's tracks with apps in development mode, so here's Spotify's own player. Play above streams the whole playlist through Sine; songs tapped in the embed play inside it.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    SpotifyEmbed(playlistID: playlist.id)
                        .frame(height: 480)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    Link(destination: URL(string: "https://open.spotify.com/playlist/\(playlist.id)")!) {
                        Label("Open in Spotify", systemImage: "arrow.up.forward.app")
                            .font(.footnote.weight(.semibold))
                    }
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(SineBackground())
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard playlist.readable, tracks.isEmpty else { return }
            await loadMore()
        }
    }

    private func loadMore() async {
        guard !loadingMore, tracks.isEmpty || tracks.count < total else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page = try await model.api.playlistTracks(playlist.id, offset: tracks.count)
            tracks += page.items
            total = page.total
            await model.checkSaved(page.items)
        } catch {
            model.error = error.localizedDescription
        }
    }
}

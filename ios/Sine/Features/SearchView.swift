import SwiftUI

struct SearchView: View {
    @State private var query = ""

    var body: some View {
        NavigationStack {
            SearchResultsView(query: query, showsEmptyHint: true)
                .searchable(text: $query, prompt: "Songs, artists, albums")
                .navigationTitle("Search")
        }
    }
}

/// Search results for a query; also used when tapping a top artist on Home.
struct SearchResultsView: View {
    @Environment(AppModel.self) private var model
    let query: String
    var showsEmptyHint = false
    @State private var results: [Track] = []
    @State private var loading = false

    var body: some View {
        List {
            if loading && results.isEmpty {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if results.isEmpty {
                Text(query.isEmpty && showsEmptyHint ? "Search for a song, artist or album." : "No results.")
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
            ForEach(Array(results.enumerated()), id: \.element.id) { index, track in
                TrackRow(track: track) {
                    Task { await model.player.play(results, at: index) }
                }
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(SineBackground())
        .navigationTitle(showsEmptyHint ? "Search" : query)
        // Search as you type, after a short pause.
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard !q.isEmpty else {
                results = []
                return
            }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            loading = true
            if let found = try? await model.api.search(q), !Task.isCancelled {
                results = found
                await model.checkSaved(found)
            }
            loading = false
        }
    }
}

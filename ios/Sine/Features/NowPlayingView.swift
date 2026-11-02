import SwiftUI

struct NowPlayingView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @AppStorage("showLyrics") private var showLyrics = false
    @State private var showQueue = false
    @State private var lyrics: Lyrics?
    @State private var lyricsLoaded = false

    var body: some View {
        let player = model.player
        VStack(spacing: 0) {
            VStack(spacing: 18) {
                header
                if let track = player.track {
                    if showLyrics {
                        compactHeader(track)
                        LyricsPanel(lyrics: lyrics, loaded: lyricsLoaded)
                    } else {
                        Spacer(minLength: 0)
                        Artwork(url: track.artworkURL, corner: 14)
                            .aspectRatio(1, contentMode: .fit)
                            .frame(maxWidth: .infinity)
                            .shadow(color: .black.opacity(0.5), radius: 30, y: 16)
                            .id(track.artworkURL)
                            .transition(.opacity.combined(with: .scale(scale: 0.97)))
                        Spacer(minLength: 0)
                        titleRow(track)
                    }
                    progress
                    controls
                    footer
                } else {
                    Spacer()
                    Text("Nothing playing").foregroundStyle(.secondary)
                    Spacer()
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // A background never affects layout size, so the oversized blurred artwork can't push content off-screen.
        .background { backdrop }
        .foregroundStyle(.white)
        .animation(.easeInOut(duration: 0.35), value: showLyrics)
        .animation(.easeInOut(duration: 0.35), value: player.track?.uri)
        .sheet(isPresented: $showQueue) { QueueSheet().presentationDetents([.medium, .large]) }
        .task(id: player.track?.uri) {
            lyrics = nil
            lyricsLoaded = false
            guard let track = player.track else { return }
            lyrics = await LyricsService.lyrics(for: track)
            lyricsLoaded = true
        }
        // Swipe down to close. Simultaneous so it never steals taps from the buttons.
        .simultaneousGesture(
            DragGesture(minimumDistance: 30).onEnded { value in
                if value.translation.height > 120, abs(value.translation.width) < 80 { dismiss() }
            }
        )
    }

    private var backdrop: some View {
        ZStack {
            model.tint.deep
            Artwork(url: model.player.track?.artworkURL, corner: 0)
                .scaleEffect(1.4)
                .blur(radius: 60)
                .saturation(1.3)
                .opacity(0.6)
            LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .center, endPoint: .bottom)
        }
        .ignoresSafeArea()
    }

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down").font(.title3.weight(.semibold)).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Close now playing")
            Spacer()
            Text("NOW PLAYING").font(.caption.weight(.semibold)).tracking(1.5).opacity(0.8)
            Spacer()
            Button { showLyrics.toggle() } label: {
                Image(systemName: "quote.bubble")
                    .symbolVariant(showLyrics ? .fill : .none)
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(showLyrics ? .white.opacity(0.18) : .clear, in: Circle())
            }
            .accessibilityLabel(showLyrics ? "Hide lyrics" : "Show lyrics")
        }
    }

    private func titleRow(_ track: Track) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text(track.title).font(.title2.bold()).lineLimit(1)
                Text(track.artist).font(.body).opacity(0.75).lineLimit(1)
            }
            Spacer()
            heart(track)
        }
    }

    private func compactHeader(_ track: Track) -> some View {
        HStack(spacing: 12) {
            Artwork(url: track.artworkURL, corner: 6).frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text(track.title).font(.headline).lineLimit(1)
                Text(track.artist).font(.subheadline).opacity(0.75).lineLimit(1)
            }
            Spacer()
            heart(track)
        }
    }

    @ViewBuilder
    private func heart(_ track: Track) -> some View {
        if model.canLike {
            let saved = model.saved[track.uri] == true
            Button {
                Task { await model.toggleSaved(track) }
            } label: {
                Image(systemName: saved ? "heart.fill" : "heart")
                    .font(.title2)
                    .foregroundStyle(saved ? Color.sineGreen : .white.opacity(0.8))
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 44, height: 44)
            }
            .task(id: track.uri) { await model.checkSaved([track]) }
            .accessibilityLabel(saved ? "Remove from liked songs" : "Add to liked songs")
        }
    }

    private var progress: some View {
        let player = model.player
        return TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let position = player.progress(at: context.date)
            VStack(spacing: 4) {
                WaveProgress(positionMs: position, durationMs: player.durationMs, playing: player.isPlaying, large: true) { ms in
                    Task { await player.seek(to: ms) }
                }
                HStack {
                    Text(formatTime(position))
                    Spacer()
                    Text(formatTime(player.durationMs))
                }
                .font(.caption.monospacedDigit())
                .opacity(0.7)
            }
        }
    }

    private var controls: some View {
        let player = model.player
        return HStack {
            Button { Task { await player.toggleShuffle() } } label: {
                Image(systemName: "shuffle").font(.title3)
                    .foregroundStyle(player.shuffle ? Color.sineGreen : .white.opacity(0.85))
            }
            .accessibilityLabel(player.shuffle ? "Shuffle on" : "Shuffle off")
            Spacer()
            Button { Task { await player.previous() } } label: {
                Image(systemName: "backward.fill").font(.title)
            }
            .accessibilityLabel("Previous")
            Spacer()
            Button { Task { await player.togglePlay() } } label: {
                Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(.black)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 72, height: 72)
                    .background(.white, in: Circle())
            }
            .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
            Spacer()
            Button { Task { await player.next() } } label: {
                Image(systemName: "forward.fill").font(.title)
            }
            .accessibilityLabel("Next")
            Spacer()
            Button { Task { await player.cycleRepeat() } } label: {
                Image(systemName: player.repeatMode == .track ? "repeat.1" : "repeat").font(.title3)
                    .foregroundStyle(player.repeatMode == .off ? .white.opacity(0.85) : Color.sineGreen)
            }
            .accessibilityLabel("Repeat: \(player.repeatMode.rawValue)")
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        let player = model.player
        return HStack {
            Button { player.needsDevice = true } label: {
                Label(player.device?.name ?? "Choose a device", systemImage: player.device?.symbol ?? "hifispeaker")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(player.device == nil ? .white.opacity(0.8) : Color.sineGreen)
                    .lineLimit(1)
            }
            Spacer()
            Button { showQueue = true } label: {
                Image(systemName: "list.bullet").font(.title3).frame(width: 44, height: 44)
            }
            .accessibilityLabel("Up next")
        }
        .buttonStyle(.plain)
    }
}

/// Lyrics that follow the song: the current line is bright and stays centred; tap a line to jump there.
struct LyricsPanel: View {
    @Environment(AppModel.self) private var model
    let lyrics: Lyrics?
    let loaded: Bool

    var body: some View {
        Group {
            if !loaded {
                message("Finding lyrics…")
            } else if let lyrics {
                if lyrics.instrumental {
                    message("♪ Instrumental ♪")
                } else if let lines = lyrics.synced, !lines.isEmpty {
                    synced(lines)
                } else if let plain = lyrics.plain {
                    ScrollView {
                        Text(plain).font(.title3.weight(.semibold)).lineSpacing(6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                } else {
                    message("No lyrics found for this song.")
                }
            } else {
                message("No lyrics found for this song.")
            }
        }
        .frame(maxHeight: .infinity)
    }

    private func message(_ text: String) -> some View {
        Text(text).font(.title3).opacity(0.7).frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func synced(_ lines: [Lyrics.Line]) -> some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let position = model.player.progress(at: context.date) + 250
            let active = lines.lastIndex { $0.timeMs <= position } ?? -1
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                            Button {
                                Task { await model.player.seek(to: line.timeMs) }
                            } label: {
                                Text(line.text.isEmpty ? "♪" : line.text)
                                    .font(.title2.bold())
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .opacity(index == active ? 1 : index < active ? 0.55 : 0.35)
                                    .scaleEffect(index == active ? 1.03 : 1, anchor: .leading)
                                    .animation(.easeOut(duration: 0.3), value: active)
                            }
                            .buttonStyle(.plain)
                            .id(index)
                        }
                    }
                    .padding(.vertical, 120)
                }
                .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.15), .init(color: .black, location: 0.85), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
                .onChange(of: active) { _, index in
                    withAnimation(.easeInOut(duration: 0.5)) { proxy.scrollTo(max(index, 0), anchor: .center) }
                }
                .onAppear { proxy.scrollTo(max(active, 0), anchor: .center) }
            }
        }
    }
}

struct QueueSheet: View {
    @Environment(AppModel.self) private var model
    @State private var queue: [Track]?

    var body: some View {
        NavigationStack {
            List {
                if let track = model.player.track {
                    Section("Now playing") {
                        TrackRow(track: track) {}
                    }
                }
                Section("Next") {
                    if let queue {
                        if queue.isEmpty {
                            Text("Nothing queued after this track.").foregroundStyle(.secondary)
                        }
                        ForEach(Array(queue.enumerated()), id: \.offset) { _, track in
                            HStack(spacing: 12) {
                                Artwork(url: track.artworkURL, corner: 4).frame(width: 44, height: 44)
                                VStack(alignment: .leading) {
                                    Text(track.title).lineLimit(1)
                                    Text(track.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                            }
                        }
                    } else {
                        ProgressView()
                    }
                }
            }
            .navigationTitle("Up next")
            .navigationBarTitleDisplayMode(.inline)
            .task(id: model.player.track?.uri) { queue = await model.player.queue() }
        }
    }
}

import SwiftUI

/// Chooses which Spotify Connect device plays the music.
struct DevicePicker: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let player = model.player
        NavigationStack {
            List {
                Section {
                    if player.devices.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("No Spotify devices are available.")
                                .font(.headline)
                            Text("Open the Spotify app on this phone, or Sine in Chrome on your computer, then refresh.")
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 6)
                    }
                    ForEach(player.devices) { device in
                        Button {
                            Task {
                                await player.choose(device)
                                dismiss()
                            }
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: device.symbol)
                                    .font(.title3)
                                    .frame(width: 28)
                                    .foregroundStyle(device.isActive ? Color.sineGreen : .primary)
                                VStack(alignment: .leading) {
                                    Text(device.name).foregroundStyle(device.isActive ? Color.sineGreen : .primary)
                                    Text(device.isActive ? "Playing here" : device.type)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if device.isActive { Image(systemName: "checkmark").foregroundStyle(Color.sineGreen) }
                            }
                        }
                        .disabled(device.id == nil)
                    }
                } header: {
                    Text("Play on")
                }

                Section {
                    Button {
                        player.openSpotifyApp()
                    } label: {
                        Label("Open the Spotify app", systemImage: "arrow.up.forward.app")
                    }
                } footer: {
                    Text("Spotify doesn't let other apps stream audio on iPhone, so Sine plays through a Spotify device. Opening the Spotify app makes this phone available.")
                }
            }
            .navigationTitle("Devices")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await player.loadDevices() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Refresh devices")
                }
            }
            .task { await player.loadDevices() }
            .refreshable { await player.loadDevices() }
        }
    }
}

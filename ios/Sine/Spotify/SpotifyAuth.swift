import AuthenticationServices
import CryptoKit
import Foundation
import Observation
import UIKit

struct SpotifyToken: Codable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var scope: String
}

enum AuthError: LocalizedError {
    case cancelled
    case denied(String)
    case stateMismatch
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .cancelled: "Sign-in was cancelled."
        case .denied(let reason): "Spotify sign-in was declined (\(reason))."
        case .stateMismatch: "Sign-in failed a security check. Please try again."
        case .failed(let message): message
        }
    }
}

/// Spotify sign-in with Authorization Code + PKCE (no client secret, no backend).
@MainActor
@Observable
final class SpotifyAuth: NSObject {
    private static let tokenKey = "spotify.token"

    private(set) var token: SpotifyToken?
    var isSignedIn: Bool { token != nil }

    private var session: ASWebAuthenticationSession?
    private var refreshTask: Task<SpotifyToken, Error>?

    override init() {
        super.init()
        if let data = Keychain.load(Self.tokenKey) {
            token = try? JSONDecoder().decode(SpotifyToken.self, from: data)
        }
    }

    func signIn() async throws {
        let verifier = Self.randomString()
        let state = Self.randomString()
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))

        let server = LoopbackServer()
        try server.start(port: Config.loopbackPort)
        defer { server.stop() }

        var components = URLComponents(string: "https://accounts.spotify.com/authorize")!
        components.queryItems = [
            .init(name: "client_id", value: Config.spotifyClientID),
            .init(name: "response_type", value: "code"),
            .init(name: "redirect_uri", value: Config.redirectURI),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "code_challenge", value: challenge),
            .init(name: "scope", value: Config.scopes.joined(separator: " ")),
            .init(name: "state", value: state),
        ]

        let callback: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: components.url!, callbackURLScheme: Config.callbackScheme) { url, error in
                if let url {
                    continuation.resume(returning: url)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: AuthError.cancelled)
                } else {
                    continuation.resume(throwing: AuthError.failed(error?.localizedDescription ?? "Sign-in failed."))
                }
            }
            session.presentationContextProvider = self
            self.session = session
            session.start()
        }
        session = nil

        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in items.first { $0.name == name }?.value }
        if let error = value("error") { throw AuthError.denied(error) }
        guard value("state") == state else { throw AuthError.stateMismatch }
        guard let code = value("code") else { throw AuthError.failed("Spotify didn't return a sign-in code.") }

        token = try await requestToken([
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": Config.redirectURI,
            "code_verifier": verifier,
        ], previous: nil)
    }

    func signOut() {
        token = nil
        Keychain.delete(Self.tokenKey)
    }

    /// A valid access token, refreshed when it's about to expire.
    func accessToken() async throws -> String {
        guard let token else { throw AuthError.failed("Not signed in to Spotify.") }
        if token.expiresAt.timeIntervalSinceNow > 60 { return token.accessToken }
        if refreshTask == nil {
            refreshTask = Task {
                defer { refreshTask = nil }
                return try await requestToken(
                    ["grant_type": "refresh_token", "refresh_token": token.refreshToken], previous: token)
            }
        }
        let refreshed = try await refreshTask!.value
        self.token = refreshed
        return refreshed.accessToken
    }

    /// True when the stored sign-in predates scopes the app now needs.
    var missingScopes: Bool {
        guard let token else { return false }
        let granted = Set(token.scope.split(separator: " ").map(String.init))
        return Config.scopes.contains { !granted.contains($0) }
    }

    private func requestToken(_ params: [String: String], previous: SpotifyToken?) async throws -> SpotifyToken {
        var request = URLRequest(url: URL(string: "https://accounts.spotify.com/api/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = (params.merging(["client_id": Config.spotifyClientID]) { a, _ in a })
            .map { URLQueryItem(name: $0.key, value: $0.value) }
        request.httpBody = form.percentEncodedQuery?.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (response as? HTTPURLResponse)?.statusCode == 200, let access = json["access_token"] as? String else {
            let reason = json["error_description"] as? String ?? json["error"] as? String ?? "unknown error"
            if previous != nil { signOut() }
            throw AuthError.failed("Spotify sign-in failed: \(reason)")
        }
        let token = SpotifyToken(
            accessToken: access,
            refreshToken: json["refresh_token"] as? String ?? previous?.refreshToken ?? "",
            expiresAt: Date().addingTimeInterval(json["expires_in"] as? Double ?? 3600),
            scope: json["scope"] as? String ?? previous?.scope ?? ""
        )
        if let data = try? JSONEncoder().encode(token) { Keychain.save(data, for: Self.tokenKey) }
        return token
    }

    private static func randomString() -> String {
        var bytes = [UInt8](repeating: 0, count: 48)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return base64URL(Data(bytes))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension SpotifyAuth: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}

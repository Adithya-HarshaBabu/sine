import Foundation
import Network

/// A tiny HTTP server on 127.0.0.1 that catches Spotify's sign-in redirect and bounces it to
/// `sine://callback?…`, which ASWebAuthenticationSession intercepts to finish sign-in.
final class LoopbackServer {
    private var listener: NWListener?

    func start(port: UInt16) throws {
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        parameters.allowLocalEndpointReuse = true
        let listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: port)!)
        listener.newConnectionHandler = { connection in
            connection.start(queue: .main)
            connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { data, _, _, _ in
                // Request line looks like: GET /?code=…&state=… HTTP/1.1
                let request = String(decoding: data ?? Data(), as: UTF8.self)
                let target = request.split(separator: " ").dropFirst().first.map(String.init) ?? "/"
                let query = target.split(separator: "?", maxSplits: 1).dropFirst().first.map(String.init) ?? ""
                let response = [
                    "HTTP/1.1 302 Found",
                    "Location: \(Config.callbackScheme)://callback?\(query)",
                    "Content-Length: 0",
                    "Connection: close",
                    "", "",
                ].joined(separator: "\r\n")
                connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
            }
        }
        listener.start(queue: .main)
        self.listener = listener
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }
}

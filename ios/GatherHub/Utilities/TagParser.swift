import Foundation

/// Parsing helpers for GatherHub asset tag identifiers.
///
/// A tag id is an opaque token of the form `tag_` followed by lowercase base32
/// characters, e.g. `tag_ab12cd34ef56`. QR codes and NFC tags can encode the id
/// in several ways; `TagParser.extractTagId(from:)` normalises all of them down
/// to the bare id.
enum TagParser {

    /// Regex matching a bare tag id anywhere in a string: `tag_` + alphanumerics.
    /// Kept liberal to tolerate generated-id alphabet or length changes.
    private static let tagPattern = #/tag_[0-9a-zA-Z]+/#

    /// Extract a `tag_...` id from any of the supported encodings:
    ///
    /// - A web landing URL:  `https://app.gatherhub.au/a/tag_ab12cd34ef56`
    /// - A custom deep link: `gatherhub://asset/tag_ab12cd34ef56`
    /// - A bare id:          `tag_ab12cd34ef56`
    ///
    /// The match is also tolerant of surrounding whitespace, query strings, and
    /// trailing path components, because it scans for the first `tag_...` token
    /// rather than requiring an exact format.
    ///
    /// - Parameter raw: the scanned QR string or NFC tag payload text.
    /// - Returns: the normalised tag id (e.g. `tag_ab12cd34ef56`), or `nil` if
    ///   the input does not contain a recognisable tag id.
    static func extractTagId(from raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // Find the first `tag_...` token regardless of URL / deep-link wrapping.
        guard let match = trimmed.firstMatch(of: tagPattern) else { return nil }
        return String(match.output).lowercased()
    }

    /// Whether a string is exactly a bare tag id with no surrounding content.
    static func isBareTagId(_ value: String) -> Bool {
        guard let match = value.wholeMatch(of: tagPattern) else { return false }
        return String(match.output) == value
    }
}

import SwiftUI
import UIKit

/// Renders a community post body, which may be legacy plain text or the HTML
/// rich text produced by the web editor (bold, lists, links, tables, …).
///
/// HTML is parsed with `NSAttributedString`'s importer — no JavaScript and no
/// network — so markup renders inline as native text and is safe to display.
struct PostBody: View {
    let text: String
    let isHTML: Bool

    var body: some View {
        if isHTML {
            HTMLText(html: text)
        } else {
            Text(text)
                .font(.gh.body)
                .foregroundStyle(Color.gh.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Renders sanitized HTML as a native `Text`. Falls back to stripped plain text
/// until parsing completes (and if parsing fails).
struct HTMLText: View {
    let html: String
    @Environment(\.colorScheme) private var colorScheme
    @State private var rendered: AttributedString?

    var body: some View {
        Group {
            if let rendered {
                Text(rendered)
                    .tint(Color.gh.accent)
            } else {
                Text(RichTextRenderer.plainText(from: html))
                    .font(.gh.body)
                    .foregroundStyle(Color.gh.ink)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: renderKey) {
            rendered = RichTextRenderer.attributed(from: html, colorScheme: colorScheme)
        }
    }

    /// Re-render when the body or the colour scheme changes.
    private var renderKey: String {
        "\(colorScheme == .dark ? "d" : "l")|\(html)"
    }
}

enum RichTextRenderer {
    /// Parse sanitized HTML into an `AttributedString`. Must run on the main
    /// actor — the HTML importer is backed by WebKit and is main-thread only.
    @MainActor
    static func attributed(from html: String, colorScheme: ColorScheme) -> AttributedString? {
        // Approximate the `ink` design token for each scheme; links use accent.
        let inkHex = colorScheme == .dark ? "CDD1DC" : "2C2F3D"
        let document = """
        <style>
        body{font-family:-apple-system,system-ui,sans-serif;font-size:15px;line-height:1.4;color:#\(inkHex);margin:0;}
        h2{font-size:17px;font-weight:600;margin:8px 0 4px;}
        h3{font-size:15px;font-weight:600;margin:7px 0 3px;}
        p{margin:0 0 6px;}
        ul,ol{margin:0 0 6px;padding-left:20px;}
        li{margin:2px 0;}
        blockquote{margin:0 0 6px;padding-left:10px;border-left:2px solid #88888888;}
        code,pre{font-family:ui-monospace,Menlo,monospace;font-size:13px;}
        table{border-collapse:collapse;}
        th,td{border:1px solid #88888888;padding:4px 8px;text-align:left;}
        th{font-weight:600;}
        a{color:#3B6FD0;}
        </style>
        \(html)
        """
        guard let data = document.data(using: .utf8) else { return nil }
        let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue,
        ]
        guard
            let ns = try? NSMutableAttributedString(
                data: data,
                options: options,
                documentAttributes: nil
            )
        else { return nil }
        // The importer appends a trailing newline; drop it to avoid a gap.
        while ns.string.hasSuffix("\n") {
            ns.deleteCharacters(in: NSRange(location: ns.length - 1, length: 1))
        }
        return try? AttributedString(ns, including: \.uiKit)
    }

    /// Flatten HTML to a single line of text for list previews.
    static func plainText(from html: String) -> String {
        html
            .replacingOccurrences(of: "<br>", with: " ", options: .caseInsensitive)
            .replacingOccurrences(of: "</p>", with: " ", options: .caseInsensitive)
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

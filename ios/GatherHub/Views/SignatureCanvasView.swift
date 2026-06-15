import SwiftUI

/// A minimal signature pad built on SwiftUI `Canvas` + `DragGesture`. Collects
/// stroke points so the surrounding form can tell whether a signature was
/// drawn (`hasSignature`).
///
/// NOTE: this captures points in-memory only. There is no offline file-upload
/// plumbing yet, so the captured signature is NOT forwarded to the backend —
/// the core custody event is enqueued without it (see `WasteCaptureView`).
/// When an offline image-upload queue lands, serialise `strokes` to a PNG and
/// attach the resulting `signatureFileId` to the pickup/arrival mutation.
struct SignatureCanvasView: View {
    /// All completed + in-progress strokes. Each stroke is an ordered list of
    /// points in the canvas's local coordinate space.
    @Binding var strokes: [[CGPoint]]

    @State private var currentStroke: [CGPoint] = []

    var hasSignature: Bool {
        !strokes.isEmpty || currentStroke.count > 1
    }

    var body: some View {
        VStack(alignment: .leading, spacing: GHSpacing.sm) {
            Canvas { context, _ in
                var path = Path()
                for stroke in strokes {
                    appendStroke(stroke, to: &path)
                }
                appendStroke(currentStroke, to: &path)
                context.stroke(
                    path,
                    with: .color(Color.gh.inkStrong),
                    style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round)
                )
            }
            .frame(height: 160)
            .background(Color.gh.surfaceSunk)
            .clipShape(RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: GHSpacing.cardRadius, style: .continuous)
                    .stroke(Color.gh.hairline, lineWidth: 1)
            )
            .overlay(alignment: .center) {
                if !hasSignature {
                    Text("Sign here")
                        .font(.gh.caption)
                        .foregroundStyle(Color.gh.inkQuiet)
                        .allowsHitTesting(false)
                }
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        currentStroke.append(value.location)
                    }
                    .onEnded { _ in
                        if currentStroke.count > 1 {
                            strokes.append(currentStroke)
                        }
                        currentStroke = []
                    }
            )

            Button("Clear signature") {
                strokes = []
                currentStroke = []
            }
            .font(.gh.caption)
            .buttonStyle(.plain)
            .foregroundStyle(Color.gh.accent)
            .disabled(!hasSignature)
        }
    }

    private func appendStroke(_ stroke: [CGPoint], to path: inout Path) {
        guard let first = stroke.first else { return }
        path.move(to: first)
        for point in stroke.dropFirst() {
            path.addLine(to: point)
        }
    }
}

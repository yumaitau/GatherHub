import * as React from "react";
import { useConvex } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { ScanLine, Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared";

/** Extract an opaque `tag_…` id from a scanned URL, deep link, or bare id. */
export function extractTagId(input: string): string | null {
  const match = input.match(/tag_[0-9a-z]+/i);
  return match ? match[0] : null;
}

export default function ScanPage() {
  const convex = useConvex();
  const navigate = useNavigate();
  const [raw, setRaw] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const resolve = React.useCallback(
    async (value: string) => {
      const tagId = extractTagId(value);
      if (!tagId) {
        setError("That doesn't look like a GatherHub tag.");
        return;
      }
      setError(null);
      const result = await convex.query(api.tags.lookupAuthed, { tagId });
      if (!result.found) {
        setError("No asset in your club matches that tag.");
        return;
      }
      navigate(`/assets/${result.asset._id}`);
    },
    [convex, navigate],
  );

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  React.useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    setError(null);
    // BarcodeDetector is available in Chromium browsers; degrade gracefully.
    const Detector = (
      window as unknown as { BarcodeDetector?: new (o: object) => unknown }
    ).BarcodeDetector;
    if (!Detector) {
      setError(
        "Live camera scanning isn't supported in this browser. Paste the link or tag id below, or use the iOS app.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new Detector({ formats: ["qr_code"] }) as {
        detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
      };
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0 && codes[0]) {
            stopCamera();
            await resolve(codes[0].rawValue);
            return;
          }
        } catch {
          /* transient */
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setError("Could not access the camera.");
      setScanning(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Scan asset"
        description="Scan a KitTrace QR code or enter a tag id to jump to an asset."
      />
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4" /> Camera
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
              {scanning ? (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ScanLine className="h-10 w-10" />
                </div>
              )}
            </div>
            {scanning ? (
              <Button variant="outline" className="w-full" onClick={stopCamera}>
                <CameraOff className="h-4 w-4" /> Stop camera
              </Button>
            ) : (
              <Button className="w-full" onClick={startCamera}>
                <Camera className="h-4 w-4" /> Start camera
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enter manually</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Paste link or tag_… id"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") resolve(raw);
              }}
            />
            <Button
              className="w-full"
              onClick={() => resolve(raw)}
              disabled={!raw}
            >
              Look up
            </Button>
          </CardContent>
        </Card>

        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}

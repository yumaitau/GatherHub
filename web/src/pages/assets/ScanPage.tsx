import * as React from "react";
import { useConvex } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { ScanLine, Camera, CameraOff, Nfc, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared";

/** Extract an opaque `tag_…` id from a scanned URL, deep link, or bare id. */
export function extractTagId(input: string): string | null {
  const match = input.match(/tag_[0-9a-z]+/i);
  return match ? match[0] : null;
}

interface NDEFReaderLike {
  scan: (opts?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener: (
    type: "reading",
    listener: (e: NDEFReadingEventLike) => void,
  ) => void;
}
interface NDEFReadingEventLike {
  serialNumber?: string;
  message: { records: NDEFRecordLike[] };
}
interface NDEFRecordLike {
  recordType: string;
  data?: ArrayBuffer | DataView;
  mediaType?: string;
}

function hasWebNfc(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

function decodeRecord(record: NDEFRecordLike): string | null {
  if (!record.data) return null;
  try {
    const decoder = new TextDecoder();
    const buf =
      record.data instanceof ArrayBuffer
        ? new Uint8Array(record.data)
        : new Uint8Array(
            record.data.buffer,
            record.data.byteOffset,
            record.data.byteLength,
          );
    return decoder.decode(buf);
  } catch {
    return null;
  }
}

export default function ScanPage() {
  const convex = useConvex();
  const navigate = useNavigate();
  const [raw, setRaw] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [nfcScanning, setNfcScanning] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const nfcAbortRef = React.useRef<AbortController | null>(null);

  const resolve = React.useCallback(
    async (value: string) => {
      const tagId = extractTagId(value);
      if (!tagId) {
        setError("That does not look like a GatherHub tag.");
        return;
      }
      setError(null);
      const result = await convex.query(api.tags.lookupAuthed, { tagId });
      if (!result.found) {
        setError("No asset in your organisation matches that tag.");
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

  const stopNfc = React.useCallback(() => {
    nfcAbortRef.current?.abort();
    nfcAbortRef.current = null;
    setNfcScanning(false);
  }, []);

  React.useEffect(
    () => () => {
      stopCamera();
      stopNfc();
    },
    [stopCamera, stopNfc],
  );

  async function startNfc() {
    setError(null);
    if (!hasWebNfc()) {
      setError(
        "Web NFC is not supported on this device. Use Chrome on Android, scan the QR code, or use the iOS app.",
      );
      return;
    }
    const NDEFReaderCtor = (
      window as unknown as { NDEFReader: new () => NDEFReaderLike }
    ).NDEFReader;
    const reader = new NDEFReaderCtor();
    const controller = new AbortController();
    nfcAbortRef.current = controller;
    try {
      await reader.scan({ signal: controller.signal });
      setNfcScanning(true);
      reader.addEventListener("reading", (e) => {
        // Try the NDEF record payloads first, then fall back to the
        // hardware serial number (some unprovisioned tags only expose
        // that).
        for (const record of e.message.records) {
          const text = decodeRecord(record);
          if (!text) continue;
          const tagId = extractTagId(text);
          if (tagId) {
            stopNfc();
            resolve(tagId);
            return;
          }
        }
        if (e.serialNumber) {
          const tagId = extractTagId(e.serialNumber);
          if (tagId) {
            stopNfc();
            resolve(tagId);
            return;
          }
        }
        setError(
          "Tag read but no GatherHub id found. Was it written by the iOS app?",
        );
      });
    } catch (err) {
      setNfcScanning(false);
      const message =
        err instanceof Error ? err.message : "Could not start NFC.";
      setError(
        `NFC unavailable: ${message}. Try Chrome on Android, scan the QR, or use the iOS app.`,
      );
    }
  }

  async function startCamera() {
    setError(null);
    const Detector = (
      window as unknown as { BarcodeDetector?: new (o: object) => unknown }
    ).BarcodeDetector;
    if (!Detector) {
      setError(
        "Live camera scanning is not supported in this browser. Paste the link or tag id below, or use the iOS app.",
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
        description="Scan a KitTrace QR code, hold the device to an NFC tag, or paste a tag id to jump to an asset."
      />
      <div className="mx-auto max-w-md space-y-5">
        <section className="rounded-md border border-hairline bg-surface overflow-hidden">
          <header className="flex items-center gap-2 px-5 py-3 border-b border-hairline">
            <Camera
              className="h-4 w-4 text-ink-quiet"
              aria-hidden="true"
            />
            <h2 className="text-title text-ink-strong">Camera</h2>
          </header>
          <div className="p-5 space-y-3">
            <div className="aspect-square overflow-hidden rounded-sm border border-hairline bg-surface-sunk">
              {scanning ? (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <div
                  className="flex h-full items-center justify-center text-ink-quiet"
                  aria-hidden="true"
                >
                  <ScanLine className="h-8 w-8" />
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
          </div>
        </section>

        <section className="rounded-md border border-hairline bg-surface overflow-hidden">
          <header className="flex items-center gap-2 px-5 py-3 border-b border-hairline">
            <Nfc className="h-4 w-4 text-ink-quiet" aria-hidden="true" />
            <h2 className="text-title text-ink-strong">NFC</h2>
          </header>
          <div className="p-5 space-y-3">
            <p className="text-body text-ink-soft max-w-prose">
              {hasWebNfc()
                ? "Tap Start, then hold the back of your phone against the tag. Chrome on Android only."
                : "Web NFC is not supported on this device. Use the iOS app for NFC, or scan the QR code instead."}
            </p>
            {nfcScanning ? (
              <Button variant="outline" className="w-full" onClick={stopNfc}>
                <X className="h-4 w-4" /> Stop NFC
              </Button>
            ) : (
              <Button
                className="w-full"
                onClick={startNfc}
                disabled={!hasWebNfc()}
              >
                <Nfc className="h-4 w-4" /> Start NFC
              </Button>
            )}
          </div>
        </section>

        <section className="rounded-md border border-hairline bg-surface overflow-hidden">
          <header className="px-5 py-3 border-b border-hairline">
            <h2 className="text-title text-ink-strong">Enter manually</h2>
            <p className="text-caption text-ink-quiet mt-0.5">
              Paste a scanned link or the tag id directly.
            </p>
          </header>
          <div className="p-5 space-y-3">
            <Input
              placeholder="Paste link or tag_… id"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") resolve(raw);
              }}
              className="font-mono"
            />
            <Button
              className="w-full"
              onClick={() => resolve(raw)}
              disabled={!raw}
            >
              Look up
            </Button>
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="text-center text-body text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import QRCode from "qrcode";
import {
  DEFAULT_QR_SETTINGS,
  type QRMatrix,
  type QRSettings,
} from "@/lib/qr/types";
import { renderQRCodeSVG } from "@/lib/qr/render-svg";
import { userErrorMessage } from "@/lib/feedback";

/** Build the public lookup URL encoded in an asset's QR code. */
export function assetTagUrl(tagId: string): string {
  const base = (
    import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin
  ).replace(/\/$/, "");
  return `${base}/a/${tagId}`;
}

/**
 * Configurable QR component. Generates the QR matrix with the `qrcode`
 * package and renders it as inline SVG via the renderer ported from
 * new-indigi-link. Settings (dot style, finder style, colours, border,
 * logo overlay) flow in from the org's saved QR profile.
 *
 * The QR encodes only the opaque lookup URL — never private asset data.
 * See /docs/kittrace.md.
 */
export function QrCode({
  value,
  size = 192,
  settings,
  logoUrl,
  className,
}: {
  value: string;
  size?: number;
  settings?: Partial<QRSettings>;
  logoUrl?: string | null;
  className?: string;
}) {
  const merged: QRSettings = React.useMemo(
    () => ({ ...DEFAULT_QR_SETTINGS, ...settings, size }),
    [settings, size],
  );

  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: "H" });
      const matrix: QRMatrix = {
        size: qr.modules.size,
        data: Array.from(qr.modules.data),
      };
      const next = renderQRCodeSVG(matrix, merged, logoUrl ?? null);
      if (!cancelled) {
        setSvg(next);
        setError(null);
      }
    } catch (e) {
      if (!cancelled) {
        setError(userErrorMessage(e, "Could not render QR code."));
        setSvg(null);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [value, merged, logoUrl]);

  if (error) {
    return <p className="text-sm text-danger">QR error: {error}</p>;
  }
  if (!svg) {
    return (
      <div
        className="animate-pulse rounded bg-surface-sunk"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
